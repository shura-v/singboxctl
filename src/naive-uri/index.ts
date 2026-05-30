import { isIP } from "node:net";
import { FriendlyMessageError } from "../cli.js";

export type NaiveOutbound = {
  extra_headers?: Record<string, string>;
  password: string;
  quic?: true;
  server: string;
  server_port: number;
  tls: {
    enabled: true;
    server_name: string;
  };
  type: "naive";
  udp_over_tcp?: true;
  username: string;
};

type ParsedNaiveUri = {
  duplicateQueryParameterNames: string[];
  extraHeaders: string;
  hasInvalidPasswordEncoding: boolean;
  hasInvalidUsernameEncoding: boolean;
  hasPaddingParameter: boolean;
  padding: string;
  password: string;
  portText: string;
  protocol: string;
  queryParameterNames: string[];
  server: string;
  serverName: string;
  serverPort: number;
  username: string;
};

const DEFAULT_HTTPS_PORT = 443;
const SUPPORTED_QUERY_PARAMETERS = new Set(["extra-headers", "padding", "sni"]);

export function parseNaiveUriToSingBoxOutbound(uri: string): NaiveOutbound {
  return parseNaiveUriToSingBoxOutboundDetailed(uri).outbound;
}

export function validateNaiveConnectionUri(uri: string): string[] {
  return parseNaiveUriToSingBoxOutboundDetailed(uri).warnings;
}

export function withNaiveUdpOverTcp(outbound: NaiveOutbound, enabled: boolean): NaiveOutbound {
  if (enabled) {
    return {
      ...outbound,
      udp_over_tcp: true
    };
  }

  const { udp_over_tcp: _ignored, ...outboundWithoutUdpOverTcp } = outbound;
  return outboundWithoutUdpOverTcp;
}

function parseNaiveUriToSingBoxOutboundDetailed(uri: string): {
  outbound: NaiveOutbound;
  warnings: string[];
} {
  const parsed = parseNaiveUri(uri);
  const validation = validateParsedNaiveUri(parsed);

  if (validation.issues.length > 0) {
    throw new FriendlyMessageError(formatValidationIssues(validation.issues));
  }

  const outbound: NaiveOutbound = {
    type: "naive",
    server: parsed.server,
    server_port: parsed.portText.length > 0 ? parsed.serverPort : DEFAULT_HTTPS_PORT,
    username: parsed.username,
    password: parsed.password,
    tls: {
      enabled: true,
      server_name: parsed.serverName.length > 0 ? parsed.serverName : parsed.server
    }
  };

  if (parsed.protocol === "naive+quic:") {
    outbound.quic = true;
  }

  const extraHeaders = parseExtraHeaders(parsed.extraHeaders);

  if (extraHeaders) {
    outbound.extra_headers = extraHeaders;
  }

  return {
    outbound,
    warnings: validation.warnings
  };
}

function parseNaiveUri(uri: string): ParsedNaiveUri {
  let url: URL;

  try {
    url = new URL(uri.trim());
  } catch {
    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  const queryParameterNames = new Set<string>();
  const queryParameterCounts = new Map<string, number>();

  for (const [name] of url.searchParams.entries()) {
    queryParameterNames.add(name);
    queryParameterCounts.set(name, (queryParameterCounts.get(name) ?? 0) + 1);
  }

  let username = "";
  let password = "";
  let hasInvalidUsernameEncoding = false;
  let hasInvalidPasswordEncoding = false;

  try {
    username = decodeURIComponent(url.username).trim();
  } catch {
    hasInvalidUsernameEncoding = true;
  }

  try {
    password = decodeURIComponent(url.password).trim();
  } catch {
    hasInvalidPasswordEncoding = true;
  }

  return {
    duplicateQueryParameterNames: Array.from(queryParameterCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
    extraHeaders: readQueryValue(url, "extra-headers"),
    hasInvalidPasswordEncoding,
    hasInvalidUsernameEncoding,
    hasPaddingParameter: url.searchParams.has("padding"),
    padding: readQueryValue(url, "padding"),
    password,
    portText: url.port.trim(),
    protocol: url.protocol,
    queryParameterNames: Array.from(queryParameterNames),
    server: url.hostname.trim().replace(/^\[|\]$/gu, ""),
    serverName: readQueryValue(url, "sni"),
    serverPort: Number.parseInt(url.port.trim(), 10),
    username
  };
}

function validateParsedNaiveUri(parsed: ParsedNaiveUri): {
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

  if (parsed.protocol !== "naive+https:" && parsed.protocol !== "naive+quic:") {
    issues.push('Only naive+https:// and naive+quic:// URIs are supported by the Naive parser.');
  }

  if (parsed.hasInvalidUsernameEncoding) {
    issues.push("Connection URI contains invalid percent-encoding in the Naive username.");
  }

  if (parsed.hasInvalidPasswordEncoding) {
    issues.push("Connection URI contains invalid percent-encoding in the Naive password.");
  }

  if (parsed.username.length === 0) {
    issues.push("Naive URI is missing a username.");
  }

  if (parsed.password.length === 0) {
    issues.push("Naive URI is missing a password.");
  }

  if (parsed.server.length === 0) {
    issues.push("Naive URI is missing a server host.");
  }

  if (
    parsed.portText.length > 0 &&
    (!Number.isInteger(parsed.serverPort) || parsed.serverPort <= 0 || parsed.serverPort > 65535)
  ) {
    issues.push(`Naive URI has an invalid server port: "${parsed.portText}".`);
  }

  if (parsed.server.length > 0 && isIP(parsed.server) !== 0 && parsed.serverName.length === 0) {
    issues.push("Naive URI using an IP address host must include sni for TLS.");
  }

  if (repeatedSupportedQueryParameters.length > 0) {
    issues.push(
      `Repeated Naive query parameters are not supported: ${repeatedSupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (unsupportedQueryParameters.length > 0) {
    issues.push(
      `Unsupported Naive query parameters: ${unsupportedQueryParameters.map((name) => `"${name}"`).join(", ")}.`
    );
  }

  if (parsed.hasPaddingParameter) {
    warnings.push(
      `Naive padding="${parsed.padding}" is present in the provider URI but is not supported yet in the generated sing-box config.`
    );
  }

  return {
    issues,
    warnings
  };
}

function parseExtraHeaders(rawExtraHeaders: string): Record<string, string> | undefined {
  if (rawExtraHeaders.length === 0) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  for (const rawLine of rawExtraHeaders.split(/\r\n/gu)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
      throw new FriendlyMessageError(
        `Unsupported Naive extra-headers entry "${line}". Use "Header: Value" lines separated by CRLF.`
      );
    }

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (name.length === 0) {
      throw new FriendlyMessageError("Naive extra-headers contains an empty header name.");
    }

    if (Object.hasOwn(headers, name)) {
      throw new FriendlyMessageError(`Repeated Naive extra-headers entry "${name}" is not supported.`);
    }

    headers[name] = value;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
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
