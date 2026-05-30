import { FriendlyMessageError } from "./cli.js";
import {
  parseHysteria2UriToSingBoxOutbound,
  validateHysteria2ConnectionUri,
  type Hysteria2Outbound
} from "./hysteria2-uri/index.js";
import {
  parseNaiveUriToSingBoxOutbound,
  validateNaiveConnectionUri,
  withNaiveUdpOverTcp,
  type NaiveOutbound
} from "./naive-uri/index.js";
import { parseVlessUriToSingBoxOutbound, validateVlessConnectionUri } from "./vless-uri/index.js";
import type { VlessOutbound } from "./vless-uri/types.js";

export type SupportedConnectionOutbound = Hysteria2Outbound | NaiveOutbound | VlessOutbound;
export type ConnectionGenerationOptions = {
  naiveUdpOverTcp?: boolean;
};

export function parseConnectionUriToSingBoxOutbound(
  uri: string,
  options: ConnectionGenerationOptions = {}
): SupportedConnectionOutbound {
  const scheme = readUriScheme(uri);

  switch (scheme) {
    case "vless:":
      return parseVlessUriToSingBoxOutbound(uri);
    case "hysteria2:":
      return parseHysteria2UriToSingBoxOutbound(uri);
    case "naive+https:":
    case "naive+quic:":
      return withNaiveUdpOverTcp(parseNaiveUriToSingBoxOutbound(uri), options.naiveUdpOverTcp === true);
    default:
      throw new FriendlyMessageError(`Unsupported connection URI scheme "${scheme || "(empty)"}".`);
  }
}

export function validateConnectionUri(uri: string): string[] {
  const scheme = readUriScheme(uri);

  switch (scheme) {
    case "vless:":
      return validateVlessConnectionUri(uri);
    case "hysteria2:":
      return validateHysteria2ConnectionUri(uri);
    case "naive+https:":
    case "naive+quic:":
      return validateNaiveConnectionUri(uri);
    default:
      throw new FriendlyMessageError(`Unsupported connection URI scheme "${scheme || "(empty)"}".`);
  }
}

function readUriScheme(uri: string): string {
  let url: URL;

  try {
    url = new URL(uri.trim());
  } catch {
    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  return url.protocol;
}

export function isNaiveConnectionUri(uri: string): boolean {
  const scheme = readUriScheme(uri);
  return scheme === "naive+https:" || scheme === "naive+quic:";
}
