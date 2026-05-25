import type { ParsedVlessUri } from "./types.js";

export type ValidationResult = {
  issues: string[];
  warnings: string[];
};

export const SUPPORTED_COMMON_QUERY_PARAMETERS = new Set(["type", "security", "encryption", "flow"]);

export function createValidationResult(): ValidationResult {
  return {
    issues: [],
    warnings: []
  };
}

export function validateCoreVlessFields(parsed: ParsedVlessUri): ValidationResult {
  const result = createValidationResult();

  if (parsed.protocol !== "vless:") {
    result.issues.push("Only vless:// URIs are supported right now.");
  }

  if (parsed.hasInvalidUserEncoding) {
    result.issues.push("Connection URI contains invalid percent-encoding in the user UUID.");
  }

  if (parsed.uuid.length === 0) {
    result.issues.push("VLESS URI is missing the user UUID.");
  }

  if (parsed.server.length === 0) {
    result.issues.push("VLESS URI is missing the server address.");
  }

  if (parsed.portText.length === 0) {
    result.issues.push("VLESS URI is missing the server port.");
  }

  if (parsed.portText.length > 0 && (!Number.isInteger(parsed.serverPort) || parsed.serverPort <= 0 || parsed.serverPort > 65535)) {
    result.issues.push(`VLESS URI has an invalid server port: "${parsed.portText}".`);
  }

  return result;
}

export function validateCommonVlessFields(parsed: ParsedVlessUri): ValidationResult {
  const result = createValidationResult();

  if (parsed.encryption.length > 0 && parsed.encryption !== "none") {
    result.issues.push(`Unsupported VLESS encryption "${parsed.encryption}". Only none is supported right now.`);
  }

  return result;
}
