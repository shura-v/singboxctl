import type { ParsedVlessUri, VlessOutbound } from "../types.js";
import {
  SUPPORTED_COMMON_QUERY_PARAMETERS,
  createValidationResult,
  type ValidationResult
} from "../validation.js";

const SUPPORTED_FLOW_VALUES = new Set(["xtls-rprx-vision"]);
const SUPPORTED_REALITY_QUERY_PARAMETERS = new Set(["pbk", "sid", "sni", "fp", "spx"]);

type RealitySecurityOutboundFields = {
  flow?: string;
  tls: NonNullable<VlessOutbound["tls"]>;
};

export function buildRealitySecurityOutboundFields(
  parsed: ParsedVlessUri
): RealitySecurityOutboundFields {
  const outboundFields: RealitySecurityOutboundFields = {
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

  if (parsed.flow.length > 0) {
    outboundFields.flow = parsed.flow;
  }

  if (parsed.serverName.length > 0) {
    outboundFields.tls.server_name = parsed.serverName;
  }

  if (parsed.fingerprint.length > 0) {
    outboundFields.tls.utls = {
      enabled: true,
      fingerprint: parsed.fingerprint
    };
  }

  return outboundFields;
}

export function validateRealitySecurity(parsed: ParsedVlessUri): ValidationResult {
  const result = createValidationResult();
  const unsupportedQueryParameters = parsed.queryParameterNames.filter(
    (name) => !SUPPORTED_COMMON_QUERY_PARAMETERS.has(name) && !SUPPORTED_REALITY_QUERY_PARAMETERS.has(name)
  );

  if (unsupportedQueryParameters.length > 0) {
    const names = unsupportedQueryParameters.map((name) => `"${name}"`);
    result.issues.push(`Unsupported VLESS query parameters: ${names.join(", ")}.`);
  }

  if (parsed.flow.length > 0 && !SUPPORTED_FLOW_VALUES.has(parsed.flow)) {
    result.issues.push(`Unsupported VLESS flow "${parsed.flow}". Only xtls-rprx-vision is supported right now.`);
  }

  if (parsed.publicKey.length === 0) {
    result.issues.push("REALITY VLESS URI is missing pbk.");
  }

  if (parsed.serverName.length === 0) {
    result.issues.push("REALITY VLESS URI is missing sni.");
  }

  return result;
}
