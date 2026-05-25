import { FriendlyMessageError } from "../cli.js";
import { buildSecurityOutboundFields } from "./security/index.js";
import { buildStreamOutboundFields, validateStream } from "./stream/index.js";
import type { ParsedVlessUri, VlessOutbound } from "./types.js";
import { validateSecurity } from "./security/index.js";
import {
  createValidationResult,
  validateCommonVlessFields,
  validateCoreVlessFields
} from "./validation.js";

export function parseVlessUriToSingBoxOutbound(uri: string): VlessOutbound {
  return parseVlessUriToSingBoxOutboundDetailed(uri).outbound;
}

export function validateConnectionUri(uri: string): string[] {
  return parseVlessUriToSingBoxOutboundDetailed(uri).warnings;
}

function parseVlessUriToSingBoxOutboundDetailed(uri: string): {
  outbound: VlessOutbound;
  warnings: string[];
} {
  const parsed = parseVlessUri(uri);
  const streamValidation = validateCoreAndStream(parsed);

  if (streamValidation.issues.length > 0) {
    throw new FriendlyMessageError(formatValidationIssues(streamValidation.issues));
  }

  const validation = validateParsedVlessUri(parsed);

  if (validation.issues.length > 0) {
    throw new FriendlyMessageError(formatValidationIssues(validation.issues));
  }

  const stream = buildStreamOutboundFields(parsed);
  const security = buildSecurityOutboundFields(parsed);
  const outbound: VlessOutbound = {
    type: "vless",
    server: parsed.server,
    server_port: parsed.serverPort,
    uuid: parsed.uuid,
    ...stream,
    ...security
  };

  return {
    outbound,
    warnings: validation.warnings
  };
}

function parseVlessUri(uri: string): ParsedVlessUri {
  let url: URL;

  try {
    url = new URL(uri.trim());
  } catch {
    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  const queryParameterNames = new Set<string>();

  for (const [name, value] of url.searchParams.entries()) {
    if (value.trim().length === 0) {
      continue;
    }

    queryParameterNames.add(name);
  }

  let uuid = "";
  let hasInvalidUserEncoding = false;

  try {
    uuid = decodeURIComponent(url.username).trim();
  } catch {
    hasInvalidUserEncoding = true;
  }

  const server = url.hostname.trim().replace(/^\[|\]$/gu, "");

  const portText = url.port.trim();

  const serverPort = Number.parseInt(portText, 10);

  return {
    encryption: readQueryValue(url, "encryption"),
    flow: readQueryValue(url, "flow"),
    fingerprint: readQueryValue(url, "fp"),
    hasInvalidUserEncoding,
    portText,
    publicKey: readQueryValue(url, "pbk"),
    protocol: url.protocol,
    security: readQueryValue(url, "security"),
    server,
    serverName: readQueryValue(url, "sni"),
    serverPort,
    shortId: readQueryValue(url, "sid"),
    spiderX: readQueryValue(url, "spx"),
    stream: readQueryValue(url, "type"),
    queryParameterNames: Array.from(queryParameterNames),
    uuid
  };
}

function validateCoreAndStream(parsed: ParsedVlessUri): {
  issues: string[];
  warnings: string[];
} {
  const result = createValidationResult();
  const core = validateCoreVlessFields(parsed);
  const stream = validateStream(parsed);

  result.issues.push(...core.issues, ...stream.issues);
  result.warnings.push(...core.warnings, ...stream.warnings);
  return result;
}

function validateParsedVlessUri(parsed: ParsedVlessUri): {
  issues: string[];
  warnings: string[];
} {
  const result = createValidationResult();
  const common = validateCommonVlessFields(parsed);
  const security = validateSecurity(parsed);

  result.issues.push(...common.issues, ...security.issues);
  result.warnings.push(...common.warnings, ...security.warnings);

  return result;
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
