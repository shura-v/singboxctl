import { FriendlyMessageError } from "../cli.js";

export type Hysteria2Outbound = {
  password: string;
  server: string;
  server_port: number;
  tls: {
    alpn?: string[];
    enabled: true;
    server_name?: string;
  };
  type: "hysteria2";
};

type ParsedHysteria2Uri = {
  alpn: string;
  duplicateQueryParameterNames: string[];
  fingerprint: string;
  hasPasswordSegment: boolean;
  hasInvalidPasswordEncoding: boolean;
  password: string;
  portText: string;
  protocol: string;
  queryParameterNames: string[];
  security: string;
  server: string;
  serverName: string;
  serverPort: number;
};

const SUPPORTED_QUERY_PARAMETERS = new Set(["alpn", "fp", "security", "sni"]);
const SUPPORTED_ALPN_VALUES = new Set(["h2", "h3"]);

export function parseHysteria2UriToSingBoxOutbound(uri: string): Hysteria2Outbound {
  return parseHysteria2UriToSingBoxOutboundDetailed(uri).outbound;
}

export function validateHysteria2ConnectionUri(uri: string): string[] {
  return parseHysteria2UriToSingBoxOutboundDetailed(uri).warnings;
}

function parseHysteria2UriToSingBoxOutboundDetailed(uri: string): {
  outbound: Hysteria2Outbound;
  warnings: string[];
} {
  const parsed = parseHysteria2Uri(uri);
  const validation = validateParsedHysteria2Uri(parsed);

  if (validation.issues.length > 0) {
    throw new FriendlyMessageError(formatValidationIssues(validation.issues));
  }

  const tls: Hysteria2Outbound["tls"] = {
    enabled: true
  };
  const alpnValues = readAlpnValues(parsed.alpn);

  if (alpnValues.length > 0) {
    tls.alpn = alpnValues;
  }

  if (parsed.serverName.length > 0) {
    tls.server_name = parsed.serverName;
  }

  return {
    outbound: {
      type: "hysteria2",
      server: parsed.server,
      server_port: parsed.serverPort,
      password: parsed.password,
      tls
    },
    warnings: validation.warnings
  };
}

function parseHysteria2Uri(uri: string): ParsedHysteria2Uri {
  const trimmedUri = uri.trim();
  const hasPasswordSegment = hasUserinfoPasswordSegment(trimmedUri);
  let url: URL;

  try {
    url = new URL(trimmedUri);
  } catch {
    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  const queryParameterNames = new Set<string>();
  const queryParameterCounts = new Map<string, number>();

  for (const [name, value] of url.searchParams.entries()) {
    queryParameterNames.add(name);
    queryParameterCounts.set(name, (queryParameterCounts.get(name) ?? 0) + 1);
  }

  let password = "";
  let hasInvalidPasswordEncoding = false;

  try {
    password = decodeURIComponent(url.username).trim();
  } catch {
    hasInvalidPasswordEncoding = true;
  }

  return {
    alpn: readQueryValue(url, "alpn"),
    duplicateQueryParameterNames: Array.from(queryParameterCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
    fingerprint: readQueryValue(url, "fp"),
    hasPasswordSegment,
    hasInvalidPasswordEncoding,
    password,
    portText: url.port.trim(),
    protocol: url.protocol,
    queryParameterNames: Array.from(queryParameterNames),
    security: readQueryValue(url, "security"),
    server: url.hostname.trim().replace(/^\[|\]$/gu, ""),
    serverName: readQueryValue(url, "sni"),
    serverPort: Number.parseInt(url.port.trim(), 10)
  };
}

function validateParsedHysteria2Uri(parsed: ParsedHysteria2Uri): {
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  const repeatedSupportedQueryParameters = parsed.duplicateQueryParameterNames.filter((parameter) =>
    SUPPORTED_QUERY_PARAMETERS.has(parameter)
  );
  const unsupportedQueryParameters = parsed.queryParameterNames.filter(
    (parameter) => !SUPPORTED_QUERY_PARAMETERS.has(parameter)
  );

  if (parsed.protocol !== "hysteria2:") {
    issues.push("Only hysteria2:// URIs are supported by the Hysteria2 parser.");
  }

  if (parsed.hasInvalidPasswordEncoding) {
    issues.push("Connection URI contains invalid percent-encoding in the Hysteria2 password.");
  }

  if (parsed.hasPasswordSegment) {
    issues.push("Unsupported Hysteria2 userinfo format with user:pass@. Put the token before @ without ':'.");
  }

  if (parsed.password.length === 0) {
    issues.push("Hysteria2 URI is missing a password.");
  }

  if (parsed.server.length === 0) {
    issues.push("Hysteria2 URI is missing a server host.");
  }

  if (parsed.portText.length === 0) {
    issues.push("Hysteria2 URI is missing a server port.");
  }

  if (parsed.portText.length > 0 && (!Number.isInteger(parsed.serverPort) || parsed.serverPort <= 0 || parsed.serverPort > 65535)) {
    issues.push(`Hysteria2 URI has an invalid server port: "${parsed.portText}".`);
  }

  if (parsed.security !== "tls") {
    issues.push(
      `Unsupported Hysteria2 security "${parsed.security || "(empty)"}". Only tls is supported right now.`
    );
  }

  const unsupportedAlpnValues = readAlpnValues(parsed.alpn).filter((value) => !SUPPORTED_ALPN_VALUES.has(value));
  if (unsupportedAlpnValues.length > 0) {
    issues.push(
      `Unsupported Hysteria2 alpn values: ${unsupportedAlpnValues.map((value) => `"${value}"`).join(", ")}. Only h2 and h3 are supported right now.`
    );
  }

  if (repeatedSupportedQueryParameters.length > 0) {
    issues.push(
      `Repeated Hysteria2 query parameters are not supported: ${repeatedSupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (unsupportedQueryParameters.length > 0) {
    issues.push(
      `Unsupported Hysteria2 query parameters: ${unsupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (parsed.fingerprint.length > 0) {
    warnings.push(
      `Hysteria2 fp="${parsed.fingerprint}" is present in the provider URI but is not supported yet in the generated sing-box config.`
    );
  }

  return {
    issues,
    warnings
  };
}

function formatValidationIssues(issues: string[]): string {
  if (issues.length === 1) {
    return issues[0];
  }

  return issues.map((issue) => `- ${issue}`).join("\n");
}

function readQueryValue(url: URL, name: string): string {
  return url.searchParams.get(name)?.trim() ?? "";
}

function readAlpnValues(rawAlpn: string): string[] {
  if (rawAlpn.length === 0) {
    return [];
  }

  return rawAlpn
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function hasUserinfoPasswordSegment(uri: string): boolean {
  const schemeSeparatorIndex = uri.indexOf("://");

  if (schemeSeparatorIndex === -1) {
    return false;
  }

  const authorityStartIndex = schemeSeparatorIndex + 3;
  const authorityEndCandidates = [uri.indexOf("/", authorityStartIndex), uri.indexOf("?", authorityStartIndex), uri.indexOf("#", authorityStartIndex)].filter(
    (index) => index !== -1
  );
  const authorityEndIndex =
    authorityEndCandidates.length > 0 ? Math.min(...authorityEndCandidates) : uri.length;
  const authority = uri.slice(authorityStartIndex, authorityEndIndex);
  const atIndex = authority.lastIndexOf("@");

  if (atIndex === -1) {
    return false;
  }

  const userinfo = authority.slice(0, atIndex);
  return userinfo.includes(":");
}
