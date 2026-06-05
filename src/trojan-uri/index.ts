import { FriendlyMessageError } from "../cli.js";

export type TrojanOutbound = {
  password: string;
  server: string;
  server_port: number;
  tls: {
    enabled: true;
    insecure: false;
    reality: {
      enabled: true;
      public_key: string;
      short_id: string;
    };
    server_name?: string;
    utls?: {
      enabled: true;
      fingerprint: string;
    };
  };
  type: "trojan";
};

type ParsedTrojanUri = {
  duplicateQueryParameterNames: string[];
  fingerprint: string;
  hasInvalidPasswordEncoding: boolean;
  password: string;
  portText: string;
  protocol: string;
  publicKey: string;
  queryParameterNames: string[];
  security: string;
  server: string;
  serverName: string;
  serverPort: number;
  shortId: string;
  spiderX: string;
  stream: string;
};

const SUPPORTED_QUERY_PARAMETERS = new Set(["fp", "pbk", "security", "sid", "sni", "spx", "type"]);

export function parseTrojanUriToSingBoxOutbound(uri: string): TrojanOutbound {
  return parseTrojanUriToSingBoxOutboundDetailed(uri).outbound;
}

export function validateTrojanConnectionUri(uri: string): string[] {
  return parseTrojanUriToSingBoxOutboundDetailed(uri).warnings;
}

function parseTrojanUriToSingBoxOutboundDetailed(uri: string): {
  outbound: TrojanOutbound;
  warnings: string[];
} {
  const parsed = parseTrojanUri(uri);
  const validation = validateParsedTrojanUri(parsed);

  if (validation.issues.length > 0) {
    throw new FriendlyMessageError(formatValidationIssues(validation.issues));
  }

  const outbound: TrojanOutbound = {
    type: "trojan",
    server: parsed.server,
    server_port: parsed.serverPort,
    password: parsed.password,
    tls: {
      enabled: true,
      insecure: false,
      reality: {
        enabled: true,
        public_key: parsed.publicKey,
        short_id: parsed.shortId
      }
    }
  };

  if (parsed.serverName.length > 0) {
    outbound.tls.server_name = parsed.serverName;
  }

  if (parsed.fingerprint.length > 0) {
    outbound.tls.utls = {
      enabled: true,
      fingerprint: parsed.fingerprint
    };
  }

  return {
    outbound,
    warnings: validation.warnings
  };
}

function parseTrojanUri(uri: string): ParsedTrojanUri {
  const trimmedUri = uri.trim();
  let url: URL;

  try {
    url = new URL(trimmedUri);
  } catch {
    const portText = readRawTrojanPortText(trimmedUri);

    if (portText.length > 0) {
      throw new FriendlyMessageError(`Trojan URI has an invalid server port: "${portText}".`);
    }

    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  const queryParameterNames = new Set<string>();
  const queryParameterCounts = new Map<string, number>();

  for (const [name] of url.searchParams.entries()) {
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

  const portText = url.port.trim();

  return {
    duplicateQueryParameterNames: Array.from(queryParameterCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
    fingerprint: readQueryValue(url, "fp"),
    hasInvalidPasswordEncoding,
    password,
    portText,
    protocol: url.protocol,
    publicKey: readQueryValue(url, "pbk"),
    queryParameterNames: Array.from(queryParameterNames),
    security: readQueryValue(url, "security"),
    server: url.hostname.trim().replace(/^\[|\]$/gu, ""),
    serverName: readQueryValue(url, "sni"),
    serverPort: Number.parseInt(portText, 10),
    shortId: readQueryValue(url, "sid"),
    spiderX: readQueryValue(url, "spx"),
    stream: readQueryValue(url, "type")
  };
}

function validateParsedTrojanUri(parsed: ParsedTrojanUri): {
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

  if (parsed.protocol !== "trojan:") {
    issues.push("Only trojan:// URIs are supported by the Trojan parser.");
  }

  if (parsed.hasInvalidPasswordEncoding) {
    issues.push("Connection URI contains invalid percent-encoding in the Trojan password.");
  }

  if (parsed.password.length === 0) {
    issues.push("Trojan URI is missing a password.");
  }

  if (parsed.server.length === 0) {
    issues.push("Trojan URI is missing a server host.");
  }

  if (parsed.portText.length === 0) {
    issues.push("Trojan URI is missing a server port.");
  }

  if (parsed.portText.length > 0 && (!Number.isInteger(parsed.serverPort) || parsed.serverPort <= 0 || parsed.serverPort > 65535)) {
    issues.push(`Trojan URI has an invalid server port: "${parsed.portText}".`);
  }

  if (parsed.stream.length > 0 && parsed.stream !== "tcp") {
    issues.push(`Unsupported Trojan network type "${parsed.stream}". Only tcp is supported right now.`);
  }

  if (parsed.security !== "reality") {
    issues.push(
      `Unsupported Trojan security "${parsed.security || "(empty)"}". Only reality is supported right now.`
    );
  }

  if (parsed.publicKey.length === 0) {
    issues.push("REALITY Trojan URI is missing pbk.");
  }

  if (parsed.serverName.length === 0) {
    issues.push("REALITY Trojan URI is missing sni.");
  }

  if (repeatedSupportedQueryParameters.length > 0) {
    issues.push(
      `Repeated Trojan query parameters are not supported: ${repeatedSupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (unsupportedQueryParameters.length > 0) {
    issues.push(
      `Unsupported Trojan query parameters: ${unsupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (parsed.spiderX.length > 0) {
    warnings.push(
      `Trojan spx="${parsed.spiderX}" is present in the provider URI but is not supported yet in the generated sing-box config.`
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

function readRawTrojanPortText(uri: string): string {
  const scheme = "trojan://";

  if (!uri.startsWith(scheme)) {
    return "";
  }

  const authorityStartIndex = scheme.length;
  const authorityEndCandidates = [
    uri.indexOf("/", authorityStartIndex),
    uri.indexOf("?", authorityStartIndex),
    uri.indexOf("#", authorityStartIndex)
  ].filter((index) => index !== -1);
  const authorityEndIndex = authorityEndCandidates.length > 0 ? Math.min(...authorityEndCandidates) : uri.length;
  const authority = uri.slice(authorityStartIndex, authorityEndIndex);
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);

  if (hostPort.startsWith("[")) {
    const bracketEndIndex = hostPort.indexOf("]");

    if (bracketEndIndex === -1 || hostPort[bracketEndIndex + 1] !== ":") {
      return "";
    }

    return hostPort.slice(bracketEndIndex + 2).trim();
  }

  const colonIndex = hostPort.lastIndexOf(":");

  if (colonIndex === -1) {
    return "";
  }

  return hostPort.slice(colonIndex + 1).trim();
}
