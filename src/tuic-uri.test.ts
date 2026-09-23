import { describe, expect, it } from "vitest";
import { parseConnectionUriToSingBoxOutbound } from "./connection-uri.js";
import { parseTuicUriToSingBoxOutbound } from "./tuic-uri/index.js";

describe("tuic uri parser", () => {
  it("parses a provider TUIC URI into a sing-box outbound", () => {
    expect(
      parseConnectionUriToSingBoxOutbound(
        "tuic://2dd61d93-75d8-4da4-ac0e-6aece7eac365:secret@example.com:40461?allow_insecure=0&alpn=h3%2Cspdy%2F3.1&congestion_control=bbr&udp_relay_mode=native#tuic"
      )
    ).toEqual({
      type: "tuic",
      server: "example.com",
      server_port: 40461,
      uuid: "2dd61d93-75d8-4da4-ac0e-6aece7eac365",
      password: "secret",
      congestion_control: "bbr",
      udp_relay_mode: "native",
      tls: {
        enabled: true,
        alpn: ["h3", "spdy/3.1"]
      }
    });
  });

  it("applies sni and keeps optional fields out when absent", () => {
    expect(parseTuicUriToSingBoxOutbound("tuic://id:pw@[2001:db8::1]:443?sni=example.com")).toEqual({
      type: "tuic",
      server: "2001:db8::1",
      server_port: 443,
      uuid: "id",
      password: "pw",
      tls: { enabled: true, server_name: "example.com" }
    });
  });

  it("rejects insecure TLS, unknown values and unknown parameters", () => {
    expect(() => parseTuicUriToSingBoxOutbound("tuic://id:pw@example.com:443?allow_insecure=1")).toThrow(
      'Unsupported TUIC allow_insecure "1". Supported: 0.'
    );
    expect(() => parseTuicUriToSingBoxOutbound("tuic://id:pw@example.com:443?congestion_control=reno")).toThrow(
      'Unsupported TUIC congestion_control "reno"'
    );
    expect(() => parseTuicUriToSingBoxOutbound("tuic://id:pw@example.com:443?foo=1&disable_sni=1")).toThrow(
      'Unsupported TUIC query parameters: "foo", "disable_sni".'
    );
  });

  it("requires uuid and password", () => {
    expect(() => parseTuicUriToSingBoxOutbound("tuic://id@example.com:443")).toThrow(
      "TUIC URI is missing the password."
    );
  });
});
