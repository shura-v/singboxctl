import { describe, expect, it } from "vitest";
import { isNaiveConnectionUri, parseConnectionUriToSingBoxOutbound, validateConnectionUri } from "./connection-uri.js";

describe("connection uri parser", () => {
  it("dispatches vless URIs to the vless parser", () => {
    expect(
      parseConnectionUriToSingBoxOutbound(
        "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&security=none&type=tcp#plain"
      )
    ).toEqual({
      type: "vless",
      server: "example.com",
      server_port: 443,
      uuid: "2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f"
    });
  });

  it("dispatches hysteria2 URIs to the hysteria2 parser", () => {
    expect(
      parseConnectionUriToSingBoxOutbound(
        "hysteria2://secret@example.com:443?security=tls&sni=example.com&fp=chrome#work"
      )
    ).toEqual({
      type: "hysteria2",
      server: "example.com",
      server_port: 443,
      password: "secret",
      tls: {
        enabled: true,
        server_name: "example.com"
      }
    });
  });

  it("dispatches naive URIs to the naive parser", () => {
    expect(
      parseConnectionUriToSingBoxOutbound("naive+https://alice:secret@example.com:443?sni=edge.example.com#work")
    ).toEqual({
      type: "naive",
      server: "example.com",
      server_port: 443,
      username: "alice",
      password: "secret",
      tls: {
        enabled: true,
        server_name: "edge.example.com"
      }
    });
  });

  it("enables UDP over TCP for naive URIs when requested", () => {
    expect(
      parseConnectionUriToSingBoxOutbound("naive+https://alice:secret@example.com:443?sni=edge.example.com#work", {
        naiveUdpOverTcp: true
      })
    ).toEqual({
      type: "naive",
      server: "example.com",
      server_port: 443,
      username: "alice",
      password: "secret",
      udp_over_tcp: true,
      tls: {
        enabled: true,
        server_name: "edge.example.com"
      }
    });
  });

  it("rejects unsupported URI schemes", () => {
    expect(() => validateConnectionUri("trojan://secret@example.com:443")).toThrow(
      'Unsupported connection URI scheme "trojan:".'
    );
  });

  it("surfaces hysteria2 warnings through the shared validator", () => {
    expect(
      validateConnectionUri("hysteria2://secret@example.com:443?security=tls&sni=example.com&fp=chrome#work")
    ).toEqual([
      'Hysteria2 fp="chrome" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("surfaces naive warnings through the shared validator", () => {
    expect(validateConnectionUri("naive+https://alice:secret@example.com:443?padding=true#work")).toEqual([
      'Naive padding="true" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("detects naive URI schemes", () => {
    expect(isNaiveConnectionUri("naive+https://alice:secret@example.com:443")).toBe(true);
    expect(isNaiveConnectionUri("vless://id@example.com:443?encryption=none&security=none&type=tcp")).toBe(false);
  });
});
