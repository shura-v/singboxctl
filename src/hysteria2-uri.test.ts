import { describe, expect, it } from "vitest";
import { parseHysteria2UriToSingBoxOutbound, validateHysteria2ConnectionUri } from "./hysteria2-uri/index.js";

describe("hysteria2 uri parser", () => {
  it("parses a tls hysteria2 URI into a sing-box outbound", () => {
    const outbound = parseHysteria2UriToSingBoxOutbound(
      "hysteria2://8f5726803bd04c1fbd022537bb5c7ca6@x.shura.dev:20117?alpn=h3&fp=chrome&security=tls&sni=x.shura.dev#x-hysteria-kolyan"
    );

    expect(outbound).toEqual({
      type: "hysteria2",
      server: "x.shura.dev",
      server_port: 20117,
      password: "8f5726803bd04c1fbd022537bb5c7ca6",
      tls: {
        enabled: true,
        server_name: "x.shura.dev",
        alpn: ["h3"]
      }
    });
  });

  it("strips IPv6 brackets from the parsed server host", () => {
    const outbound = parseHysteria2UriToSingBoxOutbound(
      "hysteria2://secret@[2001:db8::1]:443?security=tls&sni=example.com#ipv6"
    );

    expect(outbound).toEqual({
      type: "hysteria2",
      server: "2001:db8::1",
      server_port: 443,
      password: "secret",
      tls: {
        enabled: true,
        server_name: "example.com"
      }
    });
  });

  it("rejects unsupported security values", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound("hysteria2://secret@example.com:443?security=none&sni=example.com")
    ).toThrow('Unsupported Hysteria2 security "none". Only tls is supported right now.');
  });

  it("rejects unsupported alpn values", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound("hysteria2://secret@example.com:443?alpn=h1,h3&security=tls&sni=example.com")
    ).toThrow('Unsupported Hysteria2 alpn values: "h1". Only h2 and h3 are supported right now.');
  });

  it("keeps sni optional", () => {
    expect(
      parseHysteria2UriToSingBoxOutbound("hysteria2://secret@example.com:443?alpn=h2,h3&security=tls&fp=chrome")
    ).toEqual({
      type: "hysteria2",
      server: "example.com",
      server_port: 443,
      password: "secret",
      tls: {
        enabled: true,
        alpn: ["h2", "h3"]
      }
    });
  });

  it("warns when fp is present but not applied to the generated config", () => {
    expect(
      validateHysteria2ConnectionUri(
        "hysteria2://secret@example.com:443?alpn=h3&security=tls&sni=example.com&fp=chrome"
      )
    ).toEqual([
      'Hysteria2 fp="chrome" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("reports all unsupported query parameters in one error", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound(
        "hysteria2://secret@example.com:443?foo=1&bar=2&security=tls&sni=example.com"
      )
    ).toThrow('Unsupported Hysteria2 query parameters: "foo", "bar".');
  });

  it("reports unsupported query parameters even when their value is empty", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound(
        "hysteria2://secret@example.com:443?obfs=&security=tls&sni=example.com"
      )
    ).toThrow('Unsupported Hysteria2 query parameters: "obfs".');
  });

  it("rejects repeated supported query parameters", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound(
        "hysteria2://secret@example.com:443?security=tls&security=none&sni=example.com"
      )
    ).toThrow('Repeated Hysteria2 query parameters are not supported: "security".');
  });

  it("rejects invalid percent-encoding in the password with a friendly error", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound("hysteria2://abc%zz@example.com:443?security=tls&sni=example.com")
    ).toThrow("Connection URI contains invalid percent-encoding in the Hysteria2 password.");
  });

  it("rejects userinfo with user:pass@", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound("hysteria2://token:secret@example.com:443?security=tls&sni=example.com")
    ).toThrow("Unsupported Hysteria2 userinfo format with user:pass@. Put the token before @ without ':'.");
  });

  it("rejects userinfo with token:@", () => {
    expect(() =>
      parseHysteria2UriToSingBoxOutbound("hysteria2://token:@example.com:443?security=tls&sni=example.com")
    ).toThrow("Unsupported Hysteria2 userinfo format with user:pass@. Put the token before @ without ':'.");
  });
});
