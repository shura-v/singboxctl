import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAndWriteGeneratedConfig } from "./sing-box-config.js";
import { mockRuntimeDependencies } from "./test-helpers.js";
import {
  FULL_TUNNEL_PROFILE_NAME,
  addConnection,
  addProfile,
  addRuleSet,
  addRulesToRuleSet,
  clearActiveSelection,
  createRuleSet,
  getActiveConnectionName,
  getActiveProfileName,
  getConnection,
  getDataDirectoryPath,
  getGeneratedConfigPath,
  getIpv6Enabled,
  getLogLevel,
  getServiceIntent,
  listConnections,
  listProfiles,
  listRuleSets,
  rebuildGeneratedConfigForActiveSelection,
  removeConnection,
  removeProfile,
  removeRuleSet,
  removeRulesFromRuleSet,
  setActiveProfile,
  setProfileRuleSets,
  setActiveSelection,
  setIpv6Enabled,
  setLogLevel,
  setServiceIntent,
  setRulesForRuleSet,
  updateConnection
} from "./store.js";

const VALID_VLESS_URI =
  "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=test-public-key&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#work";

const UPDATED_VLESS_URI =
  "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@updated.example.com:8443?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=updated-public-key&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#work";

const runtime = mockRuntimeDependencies();

describe("store", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-test-"));
  });

  it("stores a connection with the user-provided name", async () => {
    const connection = await addConnection("Work Vless", "vless://example#work");

    expect(connection.name).toBe("Work Vless");
    expect(connection.uri).toBe("vless://example#work");

    const connections = await listConnections();
    expect(connections).toEqual([
      {
        name: "Work Vless",
        uri: "vless://example#work"
      }
    ]);

    const storedConnection = JSON.parse(
      await readFile(join(getDataDirectoryPath(), "connections", "Work Vless.json"), "utf8")
    ) as { name?: string; uri: string };

    expect(storedConnection).toEqual({
      uri: "vless://example#work"
    });
    expect(storedConnection).not.toHaveProperty("name");
  });

  it("rejects connections whose names differ only by case", async () => {
    await addConnection("Work", "vless://example#work");

    await expect(addConnection("work", "vless://example#work-2")).rejects.toThrow(
      'Connection "work" already exists.'
    );
  });

  it("requires exact casing when reading a stored connection", async () => {
    await addConnection("Work", "vless://example#work");

    await expect(getConnection("work")).rejects.toThrow('Connection "work" does not exist.');
  });

  it("trims connection names without changing their contents", async () => {
    const connection = await addConnection("  Work   V2   Main  ", "vless://example#work");

    expect(connection.name).toBe("Work   V2   Main");
  });

  it("rejects connection names containing a slash", async () => {
    await expect(addConnection("Work.v2/Main", "vless://example#work")).rejects.toThrow(
      'Connection name cannot contain "/".'
    );
  });

  it("stores and clears the active selection", async () => {
    await addConnection("Work", "vless://example#work");
    await addProfile("Office");
    await setServiceIntent(true);

    await setActiveSelection("Work", "Office");

    expect(await getActiveConnectionName()).toBe("Work");
    expect(await getActiveProfileName()).toBe("Office");

    await clearActiveSelection(runtime);

    expect(await getActiveConnectionName()).toBeUndefined();
    expect(await getActiveProfileName()).toBeUndefined();
    expect(await getServiceIntent()).toBe(true);
  });

  it("stores the IPv6 enabled flag in state", async () => {
    expect(await getIpv6Enabled()).toBe(false);

    await expect(setIpv6Enabled(true, runtime)).resolves.toEqual({
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    });
    expect(await getIpv6Enabled()).toBe(true);

    await expect(setIpv6Enabled(false, runtime)).resolves.toEqual({
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    });
    expect(await getIpv6Enabled()).toBe(false);
  });

  it("stores the selected log level in state", async () => {
    expect(await getLogLevel()).toBe("error");

    await setLogLevel("debug", runtime);
    expect(await getLogLevel()).toBe("debug");

    await setLogLevel("warn", runtime);
    expect(await getLogLevel()).toBe("warn");
  });

  it("does not touch runtime when rebuilding without an active selection", async () => {
    await expect(rebuildGeneratedConfigForActiveSelection(runtime)).resolves.toEqual({
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    });
  });

  it("preserves the active connection when only the active profile changes", async () => {
    await addConnection("Work", "vless://example#work");
    await addProfile("Office");
    await addProfile("Home");

    await setActiveSelection("Work", "Office");
    await setActiveProfile("Home");

    expect(await getActiveConnectionName()).toBe("Work");
    expect(await getActiveProfileName()).toBe("Home");
  });

  it("renames an active connection and keeps the active selection in sync", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("Work", "Office");

    const connection = await updateConnection("Work", "Work V2", UPDATED_VLESS_URI, runtime);

    expect(connection).toEqual({
      name: "Work V2",
      uri: UPDATED_VLESS_URI
    });
    expect(await getActiveConnectionName()).toBe("Work V2");
    expect(await listConnections()).toEqual([
      {
        name: "Work V2",
        uri: UPDATED_VLESS_URI
      }
    ]);
  });

  it("allows case-only connection renames and renames the file on disk", async () => {
    await addConnection("Work", VALID_VLESS_URI);

    const connection = await updateConnection("Work", "work", UPDATED_VLESS_URI, runtime);
    const files = await readdir(join(getDataDirectoryPath(), "connections"));

    expect(connection).toEqual({
      name: "work",
      uri: UPDATED_VLESS_URI
    });
    expect(files).toEqual(["work.json"]);
    expect(await listConnections()).toEqual([
      {
        name: "work",
        uri: UPDATED_VLESS_URI
      }
    ]);
  });

  it("rebuilds config.json when the active connection is edited", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("Work", "Office");
    await buildAndWriteGeneratedConfig("Work", "Office");

    await updateConnection("Work", "Work", UPDATED_VLESS_URI, runtime);

    const config = JSON.parse(await readFile(getGeneratedConfigPath(), "utf8")) as {
      outbounds: Array<{ server: string; server_port: number; tls: { reality: { public_key: string } } }>;
    };

    expect(config.outbounds[0]).toMatchObject({
      server: "updated.example.com",
      server_port: 8443,
      tls: {
        reality: {
          public_key: "updated-public-key"
        }
      }
    });
  });

  it("removes config.json and clears only the active connection when deleting it", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("Work", "Office");
    await buildAndWriteGeneratedConfig("Work", "Office");

    const result = await removeConnection("Work", runtime);

    await expect(readFile(getGeneratedConfigPath(), "utf8")).rejects.toThrow();
    expect(result).toEqual({
      clearedActiveConnection: true,
      clearedActiveProfile: false,
      disabledService: false,
      removedGeneratedConfig: true,
      restartedService: false,
      stoppedService: false
    });
    expect(await getActiveConnectionName()).toBeUndefined();
    expect(await getActiveProfileName()).toBe("Office");
  });

  it("removes a malformed connection file", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await writeFile(join(getDataDirectoryPath(), "connections", "Work.json"), "{", "utf8");

    const result = await removeConnection("Work", runtime);

    expect(result).toEqual({
      clearedActiveConnection: false,
      clearedActiveProfile: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    });
    await expect(listConnections()).resolves.toEqual([]);
  });

  it("removes config.json and clears only the active profile when deleting it", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("Work", "Office");
    await buildAndWriteGeneratedConfig("Work", "Office");

    const result = await removeProfile("Office", runtime);

    await expect(readFile(getGeneratedConfigPath(), "utf8")).rejects.toThrow();
    expect(result).toEqual({
      clearedActiveConnection: false,
      clearedActiveProfile: true,
      disabledService: false,
      removedGeneratedConfig: true,
      restartedService: false,
      stoppedService: false
    });
    expect(await getActiveConnectionName()).toBe("Work");
    expect(await getActiveProfileName()).toBeUndefined();
  });

  it("adds rules to a rule set from newline-separated input", async () => {
    await addRuleSet("Work");

    const addedRules = await addRulesToRuleSet(
      "Work",
      "domain:chatgpt.com\ndomain:raw.githubusercontent.com\ndomain:ios.chat.openai.com\ndomain:ab.chatgpt.com",
      runtime
    );

    expect(addedRules).toEqual([
      "domain:chatgpt.com",
      "domain:raw.githubusercontent.com",
      "domain:ios.chat.openai.com",
      "domain:ab.chatgpt.com"
    ]);

    const ruleSets = await listRuleSets();
    expect(ruleSets).toEqual([
      {
        name: "Work",
        rules: [
          "domain:chatgpt.com",
          "domain:raw.githubusercontent.com",
          "domain:ios.chat.openai.com",
          "domain:ab.chatgpt.com"
        ]
      }
    ]);
  });

  it("removes multiple selected rules from a rule set", async () => {
    await addRuleSet("Work");
    await addRulesToRuleSet(
      "Work",
      "domain:google.com\ndomain_suffix:google.com\nip_cidr:1.2.3.0/24",
      runtime
    );

    const removedRules = await removeRulesFromRuleSet("Work", [
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ], runtime);

    expect(removedRules).toEqual([
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ]);

    const profileJson = JSON.parse(
      await readFile(join(getDataDirectoryPath(), "rule-sets", "Work.json"), "utf8")
    ) as { rules: string[] };

    expect(profileJson).toEqual({
      rules: ["domain:google.com"]
    });
  });

  it("stores selected rule sets on a profile", async () => {
    await addProfile("Work");
    await addRuleSet("Google");
    await addRuleSet("Microsoft");

    await setProfileRuleSets("Work", ["Google", "Microsoft"], runtime);

    const profiles = await listProfiles();
    expect(profiles).toEqual([
      {
        name: "Work",
        ruleSetNames: ["Google", "Microsoft"]
      },
      {
        builtIn: "full-tunnel",
        name: FULL_TUNNEL_PROFILE_NAME,
        ruleSetNames: []
      }
    ]);

    const storedProfile = JSON.parse(
      await readFile(join(getDataDirectoryPath(), "profiles", "Work.json"), "utf8")
    ) as { name?: string; ruleSetNames: string[] };

    expect(storedProfile).toEqual({
      ruleSetNames: ["Google", "Microsoft"]
    });
    expect(storedProfile).not.toHaveProperty("name");
  });

  it("does not rebuild config.json when editing an inactive profile", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addProfile("Home");
    await addRuleSet("Services");
    await setActiveSelection("Work", "Office");
    await buildAndWriteGeneratedConfig("Work", "Office");
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await setProfileRuleSets("Home", ["Services"], runtime);

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });

  it("includes the built-in full-tunnel profile in profile listings", async () => {
    await addProfile("Work");

    expect(await listProfiles()).toEqual([
      {
        name: "Work",
        ruleSetNames: []
      },
      {
        builtIn: "full-tunnel",
        name: FULL_TUNNEL_PROFILE_NAME,
        ruleSetNames: []
      }
    ]);
  });

  it("rejects reserved built-in profile names for user profiles", async () => {
    await expect(addProfile(FULL_TUNNEL_PROFILE_NAME)).rejects.toThrow(
      `Profile "${FULL_TUNNEL_PROFILE_NAME}" is reserved for a built-in profile.`
    );
  });

  it("rejects case variants of the built-in profile name for user profiles", async () => {
    await expect(addProfile("all traffic (built-in)")).rejects.toThrow(
      'Profile "all traffic (built-in)" is reserved for a built-in profile.'
    );
  });

  it("rejects malformed rule set files during listing", async () => {
    await addRuleSet("Work");
    await writeFile(join(getDataDirectoryPath(), "rule-sets", "Work.json"), JSON.stringify({}), "utf8");

    await expect(listRuleSets()).rejects.toThrow('Rule set "Work" has an invalid file format.');
  });

  it("removes a malformed profile file", async () => {
    await addProfile("Work");
    await writeFile(join(getDataDirectoryPath(), "profiles", "Work.json"), JSON.stringify({}), "utf8");

    const result = await removeProfile("Work", runtime);

    expect(result).toEqual({
      clearedActiveConnection: false,
      clearedActiveProfile: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    });
    await expect(listProfiles()).resolves.toEqual([
      {
        builtIn: "full-tunnel",
        name: FULL_TUNNEL_PROFILE_NAME,
        ruleSetNames: []
      }
    ]);
  });

  it("removes a malformed rule set file", async () => {
    await addRuleSet("Work");
    await writeFile(join(getDataDirectoryPath(), "rule-sets", "Work.json"), JSON.stringify({}), "utf8");

    await removeRuleSet("Work", runtime);

    await expect(listRuleSets()).resolves.toEqual([]);
  });

  it("rejects removing a rule set with the wrong case", async () => {
    await addProfile("Office");
    await addRuleSet("Services");
    await setProfileRuleSets("Office", ["Services"], runtime);

    await expect(removeRuleSet("services", runtime)).rejects.toThrow('Rule set "services" does not exist.');

    await expect(listRuleSets()).resolves.toEqual([
      {
        name: "Services",
        rules: []
      }
    ]);
    await expect(listProfiles()).resolves.toEqual([
      {
        name: "Office",
        ruleSetNames: ["Services"]
      },
      {
        builtIn: "full-tunnel",
        name: FULL_TUNNEL_PROFILE_NAME,
        ruleSetNames: []
      }
    ]);
  });

  it("rejects unsupported stored rule entries during listing", async () => {
    await addRuleSet("Work");
    await writeFile(
      join(getDataDirectoryPath(), "rule-sets", "Work.json"),
      JSON.stringify({ rules: ["geosite:openai"] }),
      "utf8"
    );

    await expect(listRuleSets()).rejects.toThrow(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );
  });

  it("uses the filename as the rule set name", async () => {
    await addRuleSet("Google");
    await writeFile(
      join(getDataDirectoryPath(), "rule-sets", "Google.json"),
      JSON.stringify({ name: "Work", rules: ["domain:google.com"] }),
      "utf8"
    );

    await expect(listRuleSets()).resolves.toEqual([
      {
        name: "Google",
        rules: ["domain:google.com"]
      }
    ]);
  });

  it("rejects unsupported rule syntax before saving a rule set", async () => {
    await addRuleSet("Work");

    await expect(setRulesForRuleSet("Work", "geosite:openai", runtime)).rejects.toThrow(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );
  });

  it("rejects malformed rule lines before saving a rule set", async () => {
    await addRuleSet("Work");

    await expect(setRulesForRuleSet("Work", "google.com", runtime)).rejects.toThrow(
      'Unsupported rule "google.com". Use domain:, domain_suffix:, or ip_cidr:.'
    );
  });

  it("does not persist a new rule set when validation fails during creation", async () => {
    await expect(createRuleSet("Work", "geosite:openai")).rejects.toThrow(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );

    await expect(listRuleSets()).resolves.toEqual([]);
  });

  it("rejects rule set names that differ only by case", async () => {
    await addRuleSet("Services");

    await expect(createRuleSet("services", "domain:openai.com")).rejects.toThrow(
      'Rule set "services" already exists.'
    );
  });

  it("does not rebuild config.json when creating an unassigned rule set", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("Work", "Office");
    await buildAndWriteGeneratedConfig("Work", "Office");
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await createRuleSet("Services", "domain:openai.com");

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });

  it("rebuilds config.json when an active rule set changes", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addRuleSet("Services");
    await setProfileRuleSets("Office", ["Services"], runtime);
    await setActiveSelection("Work", "Office");
    await setRulesForRuleSet("Services", "domain:openai.com", runtime);

    const initialConfig = JSON.parse(await readFile(getGeneratedConfigPath(), "utf8")) as {
      route: { rules: Array<{ domain?: string[]; domain_suffix?: string[] }> };
    };

    expect(initialConfig.route.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: ["openai.com"]
        })
      ])
    );

    await setRulesForRuleSet("Services", "domain_suffix:chatgpt.com", runtime);

    const updatedConfig = JSON.parse(await readFile(getGeneratedConfigPath(), "utf8")) as {
      route: { rules: Array<{ domain?: string[]; domain_suffix?: string[] }> };
    };

    expect(updatedConfig.route.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain_suffix: ["chatgpt.com"]
        })
      ])
    );
    expect(updatedConfig.route.rules).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: ["openai.com"]
        })
      ])
    );
  });

  it("does not rebuild config.json when editing a rule set outside the active profile", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addRuleSet("Services");
    await addRuleSet("Other");
    await setProfileRuleSets("Office", ["Services"], runtime);
    await setActiveSelection("Work", "Office");
    await setRulesForRuleSet("Services", "domain:openai.com", runtime);
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await setRulesForRuleSet("Other", "domain:example.com", runtime);

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });
});

describe("readConnectionNameDefault", () => {
  it("falls back to the raw fragment when percent-decoding fails", async () => {
    const { readConnectionNameDefault } = await import("./tui/shared.js");

    expect(readConnectionNameDefault("vless://example#name%")).toBe("name%");
  });
});
