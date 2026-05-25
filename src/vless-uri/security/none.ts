import {
  SUPPORTED_COMMON_QUERY_PARAMETERS,
  createValidationResult,
  type ValidationResult
} from "../validation.js";

const SUPPORTED_NONE_SECURITY_QUERY_PARAMETERS = new Set(["pbk", "sid", "sni", "fp", "spx"]);

export function buildNoneSecurityOutboundFields(): Record<string, never> {
  return {};
}

export function validateNoneSecurity(parsed: {
  fingerprint: string;
  flow: string;
  publicKey: string;
  queryParameterNames: string[];
  serverName: string;
  shortId: string;
  spiderX: string;
}): ValidationResult {
  const result = createValidationResult();
  const unsupportedQueryParameters = parsed.queryParameterNames.filter(
    (name) => !SUPPORTED_COMMON_QUERY_PARAMETERS.has(name) && !SUPPORTED_NONE_SECURITY_QUERY_PARAMETERS.has(name)
  );

  if (parsed.flow.length > 0) {
    result.warnings.push('Ignoring flow for VLESS security "none".');
  }

  if (
    parsed.publicKey.length > 0 ||
    parsed.shortId.length > 0 ||
    parsed.serverName.length > 0 ||
    parsed.fingerprint.length > 0 ||
    parsed.spiderX.length > 0
  ) {
    result.issues.push('Unsupported TLS/REALITY-specific fields for VLESS security "none".');
  }

  if (unsupportedQueryParameters.length > 0) {
    const names = unsupportedQueryParameters.map((name) => `"${name}"`);
    result.issues.push(`Unsupported VLESS query parameters: ${names.join(", ")}.`);
  }

  return result;
}
