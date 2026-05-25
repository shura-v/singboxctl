import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addConnection,
  addDomainsToProfile,
  addProfile,
  clearActiveSelection,
  getActiveConnectionName,
  getActiveProfileName,
  getDataDirectoryPath,
  listConnections,
  listProfiles,
  removeRulesFromProfile,
  setActiveProfile,
  setActiveSelection
} from "./store.js";

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

    await setActiveSelection("work", "office");

    expect(await getActiveConnectionName()).toBe("work");
    expect(await getActiveProfileName()).toBe("office");

    await clearActiveSelection();

    expect(await getActiveConnectionName()).toBeUndefined();
    expect(await getActiveProfileName()).toBeUndefined();
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

  it("adds rules from newline-separated input", async () => {
    await addProfile("Work");

    const addedRules = await addDomainsToProfile(
      "work",
      "chatgpt.com\nraw.githubusercontent.com\nios.chat.openai.com\nab.chatgpt.com"
    );

    expect(addedRules).toEqual([
      "chatgpt.com",
      "raw.githubusercontent.com",
      "ios.chat.openai.com",
      "ab.chatgpt.com"
    ]);

    const profiles = await listProfiles();
    expect(profiles).toEqual([
      {
        name: "work",
        domains: [
          "chatgpt.com",
          "raw.githubusercontent.com",
          "ios.chat.openai.com",
          "ab.chatgpt.com"
        ]
      }
    ]);
  });

  it("removes multiple selected rules from a profile", async () => {
    await addProfile("Work");
    await addDomainsToProfile(
      "work",
      "domain:google.com\ndomain_suffix:google.com\nip_cidr:1.2.3.0/24"
    );

    const removedRules = await removeRulesFromProfile("work", [
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ]);

    expect(removedRules).toEqual([
      "domain_suffix:google.com",
      "ip_cidr:1.2.3.0/24"
    ]);

    const profileJson = JSON.parse(
      await readFile(join(getDataDirectoryPath(), "profiles", "work.json"), "utf8")
    ) as { domains: string[]; name: string };

    expect(profileJson).toEqual({
      name: "work",
      domains: ["domain:google.com"]
    });
  });
});

describe("readConnectionNameDefault", () => {
  it("falls back to the raw fragment when percent-decoding fails", async () => {
    const { readConnectionNameDefault } = await import("./tui/shared.js");

    expect(readConnectionNameDefault("vless://example#name%")).toBe("name%");
  });
});

describe("formatVpnparserFailure", () => {
  it("hides vpnparser panic stack traces behind a friendly message", async () => {
    const { formatVpnparserFailure } = await import("./tui/connections.js");

    expect(formatVpnparserFailure("panic: runtime error: invalid memory address", "")).toBe(
      "vpnparser crashed while parsing this URI. Check that it is a valid Xray-compatible URI."
    );
  });

  it("keeps regular vpnparser error text when there is no panic", async () => {
    const { formatVpnparserFailure } = await import("./tui/connections.js");

    expect(formatVpnparserFailure("unsupported scheme", "")).toBe("unsupported scheme");
  });
});
