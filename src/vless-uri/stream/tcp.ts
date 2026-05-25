import type { ParsedVlessUri, VlessOutbound } from "../types.js";
import { createValidationResult, type ValidationResult } from "../validation.js";

export function buildTcpStreamOutboundFields(
  parsed: ParsedVlessUri
): Partial<VlessOutbound> {
  return {};
}

export function validateTcpStream(parsed: ParsedVlessUri): ValidationResult {
  return createValidationResult();
}
