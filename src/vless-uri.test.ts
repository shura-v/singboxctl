import { describe, expect, it } from "vitest";
import { parseVlessUriToSingBoxOutbound, validateConnectionUri } from "./vless-uri/index.js";

describe("vless uri parser", () => {
  it("parses a tcp reality vision URI into a sing-box outbound", () => {
    const outbound = parseVlessUriToSingBoxOutbound(
      "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@89.58.30.91:53958?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=vfF_Ki-cJCD79N1tD-6IDJLLWGXh3eczpx3GtJmiRkw&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#singbox-singbox-test"
    );

    expect(outbound).toEqual({
      type: "vless",
      server: "89.58.30.91",
      server_port: 53958,
      uuid: "2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f",
      flow: "xtls-rprx-vision",
      tls: {
        enabled: true,
        insecure: false,
        server_name: "cdn.jsdelivr.net",
        reality: {
          enabled: true,
          public_key: "vfF_Ki-cJCD79N1tD-6IDJLLWGXh3eczpx3GtJmiRkw",
          short_id: "48b32b4141bb"
        },
        utls: {
          enabled: true,
          fingerprint: "ios"
        }
      }
    });

    expect(outbound).not.toHaveProperty("network");
    expect(outbound).not.toHaveProperty("packet_encoding");
  });

  it("parses a tcp VLESS URI without TLS when security=none", () => {
    const outbound = parseVlessUriToSingBoxOutbound(
      "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&security=none&type=tcp#plain"
    );

    expect(outbound).toEqual({
      type: "vless",
      server: "example.com",
      server_port: 443,
      uuid: "2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f"
    });
  });

  it("strips IPv6 brackets from the parsed server host", () => {
    const outbound = parseVlessUriToSingBoxOutbound(
      "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@[2001:db8::1]:443?encryption=none&security=none&type=tcp#ipv6"
    );

    expect(outbound).toEqual({
      type: "vless",
      server: "2001:db8::1",
      server_port: 443,
      uuid: "2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f"
    });
  });

  it("rejects unsupported non-tcp networks", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=none&pbk=test&security=reality&sni=example.com&type=ws"
      )
    ).toThrow('Unsupported VLESS network type "ws". Only tcp is supported right now.');
  });

  it("rejects unsupported VLESS Encryption values for now", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=mlkem768x25519plus.native.0rtt.test&pbk=test&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow(
      'Unsupported VLESS encryption "mlkem768x25519plus.native.0rtt.test". Only none is supported right now.'
    );
  });

  it("rejects unsupported VLESS flow values", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=none&flow=foo&pbk=test&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow('Unsupported VLESS flow "foo". Only xtls-rprx-vision is supported right now.');
  });

  it("rejects REALITY URIs without sni", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=none&pbk=test&security=reality&type=tcp"
      )
    ).toThrow("REALITY VLESS URI is missing sni.");
  });

  it("rejects TLS-specific fields when security=none", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound("vless://id@example.com:443?encryption=none&pbk=test&security=none&type=tcp")
    ).toThrow('Unsupported TLS/REALITY-specific fields for VLESS security "none".');
  });

  it("ignores SpiderX query parameters for now", () => {
    expect(
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=none&pbk=test&security=reality&sni=example.com&spx=%2Fpath&type=tcp"
      )
    ).toEqual({
      type: "vless",
      server: "example.com",
      server_port: 443,
      uuid: "id",
      tls: {
        enabled: true,
        insecure: false,
        server_name: "example.com",
        reality: {
          enabled: true,
          public_key: "test",
          short_id: ""
        }
      }
    });
  });

  it("reports all unsupported query parameters in one error", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=none&foo=1&bar=2&pbk=test&security=reality&type=tcp"
      )
    ).toThrow('Unsupported VLESS query parameters: "foo", "bar".');
  });

  it("short-circuits on unsupported stream types", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://id@example.com:443?encryption=bad&foo=1&security=reality&flow=bad-flow&type=ws"
      )
    ).toThrow('Unsupported VLESS network type "ws". Only tcp is supported right now.');
  });

  it("rejects invalid percent-encoding in the user UUID with a friendly error", () => {
    expect(() =>
      parseVlessUriToSingBoxOutbound(
        "vless://abc%zz@example.com:443?encryption=none&pbk=test&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow("Connection URI contains invalid percent-encoding in the user UUID.");
  });
});
