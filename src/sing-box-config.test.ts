import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAndWriteGeneratedConfig, parseRuleEntry } from "./sing-box-config.js";
import {
  FULL_TUNNEL_PROFILE_NAME,
  addConnection,
  addProfile,
  addRuleSet,
  addRulesToRuleSet,
  getGeneratedConfigPath,
  setIpv6Enabled,
  setLogLevel,
  setProfileRuleSets
} from "./store.js";

const VALID_VLESS_URI =
  "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=test-public-key&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#work";

describe("sing-box config builder", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-config-test-"));
  });

  it("builds and writes a generated sing-box config from the active pair data", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await addRuleSet("Services");
    await addRulesToRuleSet(
      "services",
      "domain:openai.com\ndomain_suffix:chatgpt.com\ndomain_suffix:openai.com\nip_cidr:1.2.3.0/24"
    );
    await setProfileRuleSets("office", ["services"]);

    const result = await buildAndWriteGeneratedConfig("work", "office");

    expect(result.configPath).toBe(getGeneratedConfigPath());
    expect(result.config.route.rules).toEqual([
      {
        action: "sniff"
      },
      {
        action: "hijack-dns",
        protocol: "dns"
      },
      {
        action: "route",
        ip_is_private: true,
        outbound: "direct"
      },
      {
        action: "route",
        outbound: "proxy",
        domain: ["openai.com"]
      },
      {
        action: "route",
        outbound: "proxy",
        domain_suffix: ["chatgpt.com", "openai.com"]
      },
      {
        action: "route",
        outbound: "proxy",
        ip_cidr: ["1.2.3.0/24"]
      }
    ]);
    expect(result.config.log).toEqual({
      level: "error",
      timestamp: true
    });

    const writtenConfig = JSON.parse(await readFile(result.configPath, "utf8")) as {
      dns: { final: string; servers: Array<{ tag: string; type: string }> };
      inbounds: Array<{ tag: string; type: string }>;
      log: { level: string; timestamp: boolean };
      outbounds: Array<{ tag: string; type: string }>;
    };

    expect(writtenConfig.log).toEqual({
      level: "error",
      timestamp: true
    });
    expect(writtenConfig.dns).toEqual({
      final: "local-dns",
      servers: [
        {
          type: "local",
          tag: "local-dns"
        }
      ]
    });
    expect(writtenConfig.inbounds).toEqual([
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30"],
        auto_route: true,
        strict_route: true,
        stack: "system"
      }
    ]);
    expect(writtenConfig.outbounds[0]).toEqual({
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
    });
    expect(writtenConfig.outbounds[0]).not.toHaveProperty("network");
    expect(writtenConfig.outbounds[0]).not.toHaveProperty("packet_encoding");
  });

  it("accepts optional whitespace after the rule prefix", () => {
    expect(parseRuleEntry("domain_suffix: google.com")).toEqual({
      action: "route",
      outbound: "proxy",
      domain_suffix: ["google.com"]
    });
  });

  it("rejects unsupported rule prefixes", () => {
    expect(() => parseRuleEntry("geosite:openai")).toThrowError(
      'Unsupported rule type "geosite". Use domain, domain_suffix, or ip_cidr.'
    );
  });

  it("routes all non-private traffic through proxy for the built-in full-tunnel profile", async () => {
    await addConnection("Work", VALID_VLESS_URI);

    const result = await buildAndWriteGeneratedConfig("work", FULL_TUNNEL_PROFILE_NAME);

    expect(result.config.route.final).toBe("proxy");
    expect(result.config.route.rules).toEqual([
      {
        action: "sniff"
      },
      {
        action: "hijack-dns",
        protocol: "dns"
      },
      {
        action: "route",
        ip_is_private: true,
        outbound: "direct"
      }
    ]);
  });

  it("adds an IPv6 TUN address when IPv6 is enabled", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setIpv6Enabled(true);

    const result = await buildAndWriteGeneratedConfig("work", "office");
    const writtenConfig = JSON.parse(await readFile(result.configPath, "utf8")) as {
      inbounds: Array<{ address: string[]; tag: string; type: string }>;
    };

    expect(writtenConfig.inbounds).toEqual([
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
        auto_route: true,
        strict_route: true,
        stack: "system"
      }
    ]);
  });

  it("uses the selected log level in the generated config", async () => {
    await addConnection("Work", VALID_VLESS_URI);
    await addProfile("Office");
    await setLogLevel("debug");

    const result = await buildAndWriteGeneratedConfig("work", "office");
    const writtenConfig = JSON.parse(await readFile(result.configPath, "utf8")) as {
      log: { level: string; timestamp: boolean };
    };

    expect(result.config.log).toEqual({
      level: "debug",
      timestamp: true
    });
    expect(writtenConfig.log).toEqual({
      level: "debug",
      timestamp: true
    });
  });
});
