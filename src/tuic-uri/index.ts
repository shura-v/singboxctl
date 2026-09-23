import { FriendlyMessageError } from "../cli.js";

export type TuicOutbound = {
  congestion_control?: string;
  password: string;
  server: string;
  server_port: number;
  tls: {
    alpn?: string[];
    enabled: true;
    server_name?: string;
  };
  type: "tuic";
  udp_relay_mode?: string;
  uuid: string;
};

const ALLOWED_VALUES: Record<string, string[] | null> = {
  allow_insecure: ["0"],
  alpn: null,
  congestion_control: ["cubic", "new_reno", "bbr"],
  sni: null,
  udp_relay_mode: ["native", "quic"]
};

export function validateTuicConnectionUri(uri: string): string[] {
  parseTuicUriToSingBoxOutbound(uri);
  return [];
}

export function parseTuicUriToSingBoxOutbound(uri: string): TuicOutbound {
  let url: URL;

  try {
    url = new URL(uri.trim());
  } catch {
    throw new FriendlyMessageError("Connection URI is not a valid URL.");
  }

  const issues: string[] = [];
  let uuid = "";
  let password = "";

  try {
    uuid = decodeURIComponent(url.username).trim();
    password = decodeURIComponent(url.password).trim();
  } catch {
    issues.push("Connection URI contains invalid percent-encoding in the TUIC userinfo.");
  }

  const server = url.hostname.trim().replace(/^\[|\]$/gu, "");
  const serverPort = Number(url.port);

  if (url.protocol !== "tuic:") {
    issues.push("Only tuic:// URIs are supported by the TUIC parser.");
  }

  if (uuid.length === 0) {
    issues.push("TUIC URI is missing the user UUID.");
  }

  if (password.length === 0) {
    issues.push("TUIC URI is missing the password. Use tuic://<uuid>:<password>@host:port.");
  }

  if (server.length === 0) {
    issues.push("TUIC URI is missing a server host.");
  }

  if (!Number.isInteger(serverPort) || serverPort <= 0) {
    issues.push("TUIC URI is missing a server port.");
  }

  const params = new Map<string, string>();
  const unsupported: string[] = [];

  for (const [name, rawValue] of url.searchParams.entries()) {
    const value = rawValue.trim();
    const allowed = ALLOWED_VALUES[name];

    if (allowed === undefined) {
      unsupported.push(`"${name}"`);
    } else if (params.has(name)) {
      issues.push(`Repeated TUIC query parameter is not supported: "${name}".`);
    } else if (allowed !== null && value.length > 0 && !allowed.includes(value)) {
      issues.push(`Unsupported TUIC ${name} "${value}". Supported: ${allowed.join(", ")}.`);
    } else {
      params.set(name, value);
    }
  }

  if (unsupported.length > 0) {
    issues.push(`Unsupported TUIC query parameters: ${unsupported.join(", ")}.`);
  }

  if (issues.length > 0) {
    throw new FriendlyMessageError(issues.length === 1 ? issues[0] : issues.map((issue) => `- ${issue}`).join("\n"));
  }

  const tls: TuicOutbound["tls"] = { enabled: true };
  const alpn = (params.get("alpn") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const serverName = params.get("sni") ?? "";

  if (alpn.length > 0) {
    tls.alpn = alpn;
  }

  if (serverName.length > 0) {
    tls.server_name = serverName;
  }

  const outbound: TuicOutbound = {
    type: "tuic",
    server,
    server_port: serverPort,
    uuid,
    password,
    tls
  };

  if (params.get("congestion_control")) {
    outbound.congestion_control = params.get("congestion_control");
  }

  if (params.get("udp_relay_mode")) {
    outbound.udp_relay_mode = params.get("udp_relay_mode");
  }

  return outbound;
}
