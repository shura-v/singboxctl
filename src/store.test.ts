import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAndWriteGeneratedConfig } from "./sing-box-config.js";
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
  getDataDirectoryPath,
  getGeneratedConfigPath,
  getIpv6Enabled,
  getLogLevel,
  getServiceIntent,
  listConnections,
  listProfiles,
  listRuleSets,
  removeConnection,
  removeProfile,
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

describe("store", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-test-"));
  });

  it("stores a connection with the user-provided name", async () => {
    const connection = await addConnection("Work Vless", "vless://example#work");

    expect(connection.name).toBe("work-vless");
    expect(connection.uri).toBe("vless://example#work");

    const connections = await listConnections();
    expect(connections).toEqual([
      {
        name: "work-vless",
        uri: "vless://example#work"
      }
    ]);
  });

  it("stores and clears the active selection", async () => {
    await addConnection("Work", "vless://example#work");
    await addProfile("Office");
    await setServiceIntent(true);

    await setActiveSelection("work", "office");

    expect(await getActiveConnectionName()).toBe("work");
    expect(await getActiveProfileName()).toBe("office");

    await clearActiveSelection();

    expect(await getActiveConnectionName()).toBeUndefined();
    expect(await getActiveProfileName()).toBeUndefined();
    expect(await getServiceIntent()).toBe(true);
  });

  it("stores the IPv6 enabled flag in state", async () => {
    expect(await getIpv6Enabled()).toBe(false);

    await setIpv6Enabled(true);
    expect(await getIpv6Enabled()).toBe(true);

    await setIpv6Enabled(false);
    expect(await getIpv6Enabled()).toBe(false);
  });

  it("stores the selected log level in state", async () => {
    expect(await getLogLevel()).toBe("error");

    await setLogLevel("debug");
    expect(await getLogLevel()).toBe("debug");

    await setLogLevel("warn");
    expect(await getLogLevel()).toBe("warn");
  });

  it("preserves the active connection when only the active profile changes", async () => {
    await addConnection("Work", "vless://example#work");
    await addProfile("Office");
    await addProfile("Home");

    await setActiveSelection("work", "office");
    await setActiveProfile("home");

    expect(await getActiveConnectionName()).toBe("work");
    expect(await getActiveProfileName()).toBe("home");
  });

  it("renames an active connection and keeps the active selection in sync", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("work", "office");

    const connection = await updateConnection("work", "Work V2", UPDATED_VLESS_URI);

    expect(connection).toEqual({
      name: "work-v2",
      uri: UPDATED_VLESS_URI
    });
    expect(await getActiveConnectionName()).toBe("work-v2");
    expect(await listConnections()).toEqual([
      {
        name: "work-v2",
        uri: UPDATED_VLESS_URI
      }
    ]);
  });

  it("rebuilds config.json when the active connection is edited", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("work", "office");
    await buildAndWriteGeneratedConfig("work", "office");

    await updateConnection("work", "Work", UPDATED_VLESS_URI);

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
    await setActiveSelection("work", "office");
    await buildAndWriteGeneratedConfig("work", "office");

    const result = await removeConnection("work");

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
    expect(await getActiveProfileName()).toBe("office");
  });

  it("removes config.json and clears only the active profile when deleting it", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("work", "office");
    await buildAndWriteGeneratedConfig("work", "office");

    const result = await removeProfile("office");

    await expect(readFile(getGeneratedConfigPath(), "utf8")).rejects.toThrow();
    expect(result).toEqual({
      clearedActiveConnection: false,
      clearedActiveProfile: true,
      disabledService: false,
      removedGeneratedConfig: true,
      restartedService: false,
      stoppedService: false
    });
    expect(await getActiveConnectionName()).toBe("work");
    expect(await getActiveProfileName()).toBeUndefined();
  });

  it("adds rules to a rule set from newline-separated input", async () => {
    await addRuleSet("Work");

    const addedRules = await addRulesToRuleSet(
      "work",
      "domain:chatgpt.com\ndomain:raw.githubusercontent.com\ndomain:ios.chat.openai.com\ndomain:ab.chatgpt.com"
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
        name: "work",
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
      "work",
      "domain:google.com\ndomain_suffix:google.com\nip_cidr:1.2.3.0/24"
    );

    const removedRules = await removeRulesFromRuleSet("work", [
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ]);

    expect(removedRules).toEqual([
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ]);

    const profileJson = JSON.parse(
      await readFile(join(getDataDirectoryPath(), "rule-sets", "work.json"), "utf8")
    ) as { rules: string[] };

    expect(profileJson).toEqual({
      rules: ["domain:google.com"]
    });
  });

  it("stores selected rule sets on a profile", async () => {
    await addProfile("Work");
    await addRuleSet("Google");
    await addRuleSet("Microsoft");

    await setProfileRuleSets("work", ["google", "microsoft"]);

    const profiles = await listProfiles();
    expect(profiles).toEqual([
      {
        name: "work",
        ruleSetNames: ["google", "microsoft"]
      },
      {
        builtIn: "full-tunnel",
        name: FULL_TUNNEL_PROFILE_NAME,
        ruleSetNames: []
      }
    ]);
  });

  it("does not rebuild config.json when editing an inactive profile", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addProfile("Home");
    await addRuleSet("Services");
    await setActiveSelection("work", "office");
    await buildAndWriteGeneratedConfig("work", "office");
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await setProfileRuleSets("home", ["services"]);

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });

  it("includes the built-in full-tunnel profile in profile listings", async () => {
    await addProfile("Work");

    expect(await listProfiles()).toEqual([
      {
        name: "work",
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

  it("rejects malformed rule set files during listing", async () => {
    await addRuleSet("Work");
    await writeFile(join(getDataDirectoryPath(), "rule-sets", "work.json"), JSON.stringify({}), "utf8");

    await expect(listRuleSets()).rejects.toThrow('Rule set "work" has an invalid file format.');
  });

  it("rejects unsupported stored rule entries during listing", async () => {
    await addRuleSet("Work");
    await writeFile(
      join(getDataDirectoryPath(), "rule-sets", "work.json"),
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
      join(getDataDirectoryPath(), "rule-sets", "google.json"),
      JSON.stringify({ name: "work", rules: ["domain:google.com"] }),
      "utf8"
    );

    await expect(listRuleSets()).resolves.toEqual([
      {
        name: "google",
        rules: ["domain:google.com"]
      }
    ]);
  });

  it("rejects unsupported rule syntax before saving a rule set", async () => {
    await addRuleSet("Work");

    await expect(setRulesForRuleSet("work", "geosite:openai")).rejects.toThrow(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );
  });

  it("rejects malformed rule lines before saving a rule set", async () => {
    await addRuleSet("Work");

    await expect(setRulesForRuleSet("work", "google.com")).rejects.toThrow(
      'Unsupported rule "google.com". Use domain:, domain_suffix:, or ip_cidr:.'
    );
  });

  it("does not persist a new rule set when validation fails during creation", async () => {
    await expect(createRuleSet("Work", "geosite:openai")).rejects.toThrow(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );

    await expect(listRuleSets()).resolves.toEqual([]);
  });

  it("does not rebuild config.json when creating an unassigned rule set", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setActiveSelection("work", "office");
    await buildAndWriteGeneratedConfig("work", "office");
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await createRuleSet("Services", "domain:openai.com");

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });

  it("rebuilds config.json when an active rule set changes", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addRuleSet("Services");
    await setProfileRuleSets("office", ["services"]);
    await setActiveSelection("work", "office");
    await setRulesForRuleSet("services", "domain:openai.com");

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

    await setRulesForRuleSet("services", "domain_suffix:chatgpt.com");

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
    await setProfileRuleSets("office", ["services"]);
    await setActiveSelection("work", "office");
    await setRulesForRuleSet("services", "domain:openai.com");
    const previousConfigJson = await readFile(getGeneratedConfigPath(), "utf8");

    await setRulesForRuleSet("other", "domain:example.com");

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
  });
});

describe("readConnectionNameDefault", () => {
  it("falls back to the raw fragment when percent-decoding fails", async () => {
    const { readConnectionNameDefault } = await import("./tui/shared.js");

    expect(readConnectionNameDefault("vless://example#name%")).toBe("name%");
  });
});
