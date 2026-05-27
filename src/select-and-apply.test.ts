import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { mockRuntimeDependencies } from "./test-helpers.js";
import {
  FULL_TUNNEL_PROFILE_NAME,
  addConnection,
  addProfile,
  addRuleSet,
  addRulesToRuleSet,
  getDataDirectoryPath,
  getGeneratedConfigPath,
  setProfileRuleSets
} from "./store.js";
import { getActiveSelection, listSelectableOptions, selectAndApplyByName } from "./select-and-apply.js";

const VALID_VLESS_URI =
  "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=test-public-key&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#work";

const runtime = mockRuntimeDependencies();

describe("select-and-apply module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-connect-test-"));
  });

  it("selects a connection/profile pair and writes config.json without TUI helpers", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addRuleSet("Services");
    await setProfileRuleSets("Office", ["Services"], runtime);

    const selection = await selectAndApplyByName("Work", "Office", runtime);

    expect(selection).toMatchObject({
      connectionName: "Work",
      profileName: "Office",
      configPath: join(getDataDirectoryPath(), "config.json")
    });
    expect(await getActiveSelection()).toEqual({
      connectionName: "Work",
      profileName: "Office"
    });

    const configJson = JSON.parse(await readFile(selection.configPath, "utf8")) as {
      dns: { final: string };
      inbounds: Array<{ tag: string; type: string }>;
      outbounds: Array<{ tag: string; type: string }>;
      route: { final: string; default_domain_resolver: string };
    };

    expect(configJson.dns.final).toBe("local-dns");
    expect(configJson.inbounds).toEqual([
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30"],
        auto_route: true,
        strict_route: true,
        stack: "system"
      }
    ]);
    expect(configJson.outbounds).toEqual([
      {
        type: "vless",
        tag: "proxy",
        server: "example.com",
        server_port: 443,
        uuid: "2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f",
        flow: "xtls-rprx-vision",
        tls: {
          enabled: true,
          insecure: false,
          server_name: "cdn.jsdelivr.net",
          reality: {
            enabled: true,
            public_key: "test-public-key",
            short_id: "48b32b4141bb"
          },
          utls: {
            enabled: true,
            fingerprint: "ios"
          }
        }
      },
      {
        type: "direct",
        tag: "direct"
      },
      {
        type: "block",
        tag: "block"
      }
    ]);
    expect(configJson.route.final).toBe("direct");
    expect(configJson.route.default_domain_resolver).toBe("local-dns");
  });

  it("lists selectable connection and profile names", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");

    await expect(listSelectableOptions()).resolves.toEqual({
      connections: [{ name: "Work" }],
      profiles: [{ name: "Office" }, { name: FULL_TUNNEL_PROFILE_NAME }]
    });
  });

  it("does not update the active selection when config generation fails", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addConnection(
      "Broken",
      "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=bad&security=reality&pbk=test-public-key&type=tcp#broken"
    );
    await addProfile("Office");
    await addRuleSet("Services");
    await addRulesToRuleSet("Services", "domain:openai.com", runtime);
    await setProfileRuleSets("Office", ["Services"], runtime);
    const applied = await selectAndApplyByName("Work", "Office", runtime);
    const previousConfigJson = await readFile(applied.configPath, "utf8");

    await expect(selectAndApplyByName("Broken", "Office", runtime)).rejects.toThrow(
      'Unsupported VLESS encryption "bad". Only none is supported right now.'
    );

    expect(await readFile(getGeneratedConfigPath(), "utf8")).toBe(previousConfigJson);
    expect(await getActiveSelection()).toEqual({
      connectionName: "Work",
      profileName: "Office"
    });
  });
});
