import { describe, expect, it } from "vitest";
import { parseTrojanUriToSingBoxOutbound, validateTrojanConnectionUri } from "./trojan-uri/index.js";

describe("trojan uri parser", () => {
  it("parses a tcp reality URI into a sing-box outbound", () => {
    const outbound = parseTrojanUriToSingBoxOutbound(
      "trojan://ziw1fjdxrcemnm2s@v.shura.dev:31727?fp=ios&pbk=PbHGRi9KJXU3L0fOfml3AZbzdemDGzbYtoUdyuUTMS0&security=reality&sid=7168&sni=cdn.jsdelivr.net&spx=%2FeYQqoZpRI7w6ggh&type=tcp#v-trojan-studio"
    );

    expect(outbound).toEqual({
      type: "trojan",
      server: "v.shura.dev",
      server_port: 31727,
      password: "ziw1fjdxrcemnm2s",
      tls: {
        enabled: true,
        insecure: false,
        server_name: "cdn.jsdelivr.net",
        reality: {
          enabled: true,
          public_key: "PbHGRi9KJXU3L0fOfml3AZbzdemDGzbYtoUdyuUTMS0",
          short_id: "7168"
        },
        utls: {
          enabled: true,
          fingerprint: "ios"
        }
      }
    });

    expect(outbound).not.toHaveProperty("network");
  });

  it("treats a missing network type as tcp", () => {
    expect(
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?pbk=test-public-key&security=reality&sni=example.com"
      )
    ).toEqual({
      type: "trojan",
      server: "example.com",
      server_port: 443,
      password: "secret",
      tls: {
        enabled: true,
        insecure: false,
        server_name: "example.com",
        reality: {
          enabled: true,
          public_key: "test-public-key",
          short_id: ""
        }
      }
    });
  });

  it("strips IPv6 brackets from the parsed server host", () => {
    expect(
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@[2001:db8::1]:443?pbk=test-public-key&security=reality&sni=example.com&type=tcp"
      )
    ).toEqual({
      type: "trojan",
      server: "2001:db8::1",
      server_port: 443,
      password: "secret",
      tls: {
        enabled: true,
        insecure: false,
        server_name: "example.com",
        reality: {
          enabled: true,
          public_key: "test-public-key",
          short_id: ""
        }
      }
    });
  });

  it("warns when SpiderX is present but not applied to the generated config", () => {
    expect(
      validateTrojanConnectionUri(
        "trojan://secret@example.com:443?pbk=test-public-key&security=reality&sni=example.com&spx=%2Fpath&type=tcp"
      )
    ).toEqual([
      'Trojan spx="/path" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("rejects unsupported non-tcp networks", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?pbk=test-public-key&security=reality&sni=example.com&type=ws"
      )
    ).toThrow('Unsupported Trojan network type "ws". Only tcp is supported right now.');
  });

  it("rejects unsupported security values", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?pbk=test-public-key&security=tls&sni=example.com&type=tcp"
      )
    ).toThrow('Unsupported Trojan security "tls". Only reality is supported right now.');
  });

  it("rejects missing security", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?pbk=test-public-key&sni=example.com&type=tcp"
      )
    ).toThrow('Unsupported Trojan security "(empty)". Only reality is supported right now.');
  });

  it("rejects REALITY URIs without pbk", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?security=reality&sni=example.com&type=tcp"
      )
    ).toThrow("REALITY Trojan URI is missing pbk.");
  });

  it("rejects REALITY URIs without sni", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?pbk=test-public-key&security=reality&type=tcp"
      )
    ).toThrow("REALITY Trojan URI is missing sni.");
  });

  it("rejects invalid percent-encoding in the password with a friendly error", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://abc%zz@example.com:443?pbk=test-public-key&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow("Connection URI contains invalid percent-encoding in the Trojan password.");
  });

  it("rejects invalid ports", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:70000?pbk=test-public-key&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow('Trojan URI has an invalid server port: "70000".');
  });

  it("reports all unsupported query parameters in one error", () => {
    expect(() =>
      parseTrojanUriToSingBoxOutbound(
        "trojan://secret@example.com:443?foo=1&bar=2&pbk=test-public-key&security=reality&sni=example.com&type=tcp"
      )
    ).toThrow('Unsupported Trojan query parameters: "foo", "bar".');
  });
});
