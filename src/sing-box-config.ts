import { writeFile } from "node:fs/promises";
import { FriendlyMessageError } from "./cli.js";
import {
  ensureDataDirectories,
  getConnection,
  getGeneratedConfigPath,
  getIpv6Enabled,
  getLogLevel,
  getProfile,
  getRuleSet,
  type LogLevel,
  type ConnectionRecord,
  type ProfileRecord
} from "./store.js";
import { parseVlessUriToSingBoxOutbound } from "./vless-uri/index.js";

type ProxyRouteRule = {
  action: "route";
  outbound: "proxy";
} & (
  | { domain: string[] }
  | { domain_suffix: string[] }
  | { ip_cidr: string[] }
);

type TunSupportRule =
  | {
      action: "sniff";
    }
  | {
      action: "hijack-dns";
      protocol: "dns";
    }
  | {
      action: "route";
      ip_is_private: true;
      outbound: "direct";
    };

export type SingBoxConfig = {
  dns: {
    final: "local-dns";
    servers: Array<{
      tag: "local-dns";
      type: "local";
    }>;
  };
  inbounds: Array<{
    address: string[];
    auto_route: true;
    stack: "system";
    strict_route: true;
    tag: "tun-in";
    type: "tun";
  }>;
  log: {
    level: LogLevel;
    timestamp: true;
  };
  outbounds: Array<Record<string, unknown>>;
  route: {
    auto_detect_interface: true;
    default_domain_resolver: "local-dns";
    final: "direct" | "proxy";
    rules: Array<TunSupportRule | ProxyRouteRule>;
  };
};

export type GeneratedConfigResult = {
  config: SingBoxConfig;
  configPath: string;
};

export async function buildAndWriteGeneratedConfig(
  connectionName: string,
  profileName: string
): Promise<GeneratedConfigResult> {
  const [connection, profile] = await Promise.all([getConnection(connectionName), getProfile(profileName)]);
  const config = await buildSingBoxConfig(connection, profile);
  const configPath = await writeGeneratedConfig(config);
  return { config, configPath };
}

export async function buildSingBoxConfig(
  connection: ConnectionRecord,
  profile: ProfileRecord
): Promise<SingBoxConfig> {
  const proxyOutbound = parseVlessUriToSingBoxOutbound(connection.uri);
  const [ipv6Enabled, logLevel] = await Promise.all([getIpv6Enabled(), getLogLevel()]);
  const profileRules = profile.builtIn ? [] : await readProfileRules(profile);
  const rules = [
    { action: "sniff" } as const,
    { action: "hijack-dns", protocol: "dns" } as const,
    { action: "route", ip_is_private: true, outbound: "direct" } as const,
    ...buildProxyRouteRules(profileRules)
  ];

  return {
    log: {
      level: logLevel,
      timestamp: true
    },
    dns: {
      servers: [
        {
          type: "local",
          tag: "local-dns"
        }
      ],
      final: "local-dns"
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        address: buildTunAddresses(ipv6Enabled),
        auto_route: true,
        strict_route: true,
        stack: "system"
      }
    ],
    outbounds: [
      {
        ...proxyOutbound,
        tag: "proxy"
      },
      {
        type: "direct",
        tag: "direct"
      },
      {
        type: "block",
        tag: "block"
      }
    ],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: "local-dns",
      final: profile.builtIn === "full-tunnel" ? "proxy" : "direct",
      rules
    }
  };
}

function buildTunAddresses(ipv6Enabled: boolean): string[] {
  const addresses = ["172.19.0.1/30"];

  if (ipv6Enabled) {
    addresses.push("fdfe:dcba:9876::1/126");
  }

  return addresses;
}

export async function writeGeneratedConfig(config: SingBoxConfig): Promise<string> {
  await ensureDataDirectories();
  const configPath = getGeneratedConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return configPath;
}

export function parseRuleEntry(entry: string): ProxyRouteRule {
  const match = entry.match(/^([a-z_]+)\s*:\s*(.+)$/u);

  if (!match) {
    throw new FriendlyMessageError(
      `Unsupported rule "${entry}". Use domain:, domain_suffix:, or ip_cidr:.`
    );
  }

  const [, kind, rawValue] = match;
  const value = rawValue.trim();

  if (value.length === 0) {
    throw new FriendlyMessageError(`Rule "${entry}" is missing a value.`);
  }

  switch (kind) {
    case "domain":
      return {
        action: "route",
        outbound: "proxy",
        domain: [value]
      };
    case "domain_suffix":
      return {
        action: "route",
        outbound: "proxy",
        domain_suffix: [value]
      };
    case "ip_cidr":
      return {
        action: "route",
        outbound: "proxy",
        ip_cidr: [value]
      };
    default:
      throw new FriendlyMessageError(
        `Unsupported rule type "${kind}". Use domain, domain_suffix, or ip_cidr.`
      );
  }
}

async function readProfileRules(profile: ProfileRecord): Promise<string[]> {
  const ruleSets = await Promise.all(profile.ruleSetNames.map((name) => getRuleSet(name)));
  return Array.from(new Set(ruleSets.flatMap((ruleSet) => ruleSet.rules)));
}

function buildProxyRouteRules(entries: string[]): ProxyRouteRule[] {
  const grouped = {
    domain: [] as string[],
    domain_suffix: [] as string[],
    ip_cidr: [] as string[]
  };

  for (const entry of entries) {
    const rule = parseRuleEntry(entry);

    if ("domain" in rule) {
      grouped.domain.push(...rule.domain);
      continue;
    }

    if ("domain_suffix" in rule) {
      grouped.domain_suffix.push(...rule.domain_suffix);
      continue;
    }

    grouped.ip_cidr.push(...rule.ip_cidr);
  }

  const rules: ProxyRouteRule[] = [];

  if (grouped.domain.length > 0) {
    rules.push({
      action: "route",
      outbound: "proxy",
      domain: grouped.domain
    });
  }

  if (grouped.domain_suffix.length > 0) {
    rules.push({
      action: "route",
      outbound: "proxy",
      domain_suffix: grouped.domain_suffix
    });
  }

  if (grouped.ip_cidr.length > 0) {
    rules.push({
      action: "route",
      outbound: "proxy",
      ip_cidr: grouped.ip_cidr
    });
  }

  return rules;
}
