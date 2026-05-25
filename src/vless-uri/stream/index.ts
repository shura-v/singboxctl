import { buildTcpStreamOutboundFields, validateTcpStream } from "./tcp.js";
import type { ParsedVlessUri, VlessOutbound } from "../types.js";
import type { ValidationResult } from "../validation.js";

export function buildStreamOutboundFields(
  parsed: ParsedVlessUri
): Partial<VlessOutbound> {
  switch (parsed.stream) {
    case "":
    case "tcp":
      return buildTcpStreamOutboundFields(parsed);

    default:
      throw new Error(`Invariant violation: unsupported VLESS network type reached build stage: "${parsed.stream}".`);
  }
}

export function validateStream(parsed: ParsedVlessUri): ValidationResult {
  switch (parsed.stream) {
    case "":
    case "tcp":
      return validateTcpStream(parsed);

    default:
      return {
        issues: [`Unsupported VLESS network type "${parsed.stream}". Only tcp is supported right now.`],
        warnings: []
      };
  }
}
