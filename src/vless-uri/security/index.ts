import { buildNoneSecurityOutboundFields } from "./none.js";
import { buildRealitySecurityOutboundFields, validateRealitySecurity } from "./reality.js";
import { validateNoneSecurity } from "./none.js";
import type { ParsedVlessUri, VlessOutbound } from "../types.js";
import type { ValidationResult } from "../validation.js";

export function buildSecurityOutboundFields(
  parsed: ParsedVlessUri
): Partial<Pick<VlessOutbound, "flow" | "tls">> {
  switch (parsed.security) {
    case "none":
      return buildNoneSecurityOutboundFields();

    case "reality":
      return buildRealitySecurityOutboundFields(parsed);

    default:
      throw new Error(
        `Invariant violation: unsupported VLESS security reached build stage: "${parsed.security || "(empty)"}".`
      );
  }
}

export function validateSecurity(parsed: ParsedVlessUri): ValidationResult {
  switch (parsed.security) {
    case "none":
      return validateNoneSecurity(parsed);

    case "reality":
      return validateRealitySecurity(parsed);

    default:
      return {
        issues: [
          `Unsupported VLESS security "${parsed.security || "(empty)"}". Only none and reality are supported right now.`
        ],
        warnings: []
      };
  }
}
