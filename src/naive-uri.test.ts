import { describe, expect, it } from "vitest";
import { parseNaiveUriToSingBoxOutbound, validateNaiveConnectionUri, withNaiveUdpOverTcp } from "./naive-uri/index.js";

describe("naive uri parser", () => {
  it("parses a naive+https URI into a sing-box outbound", () => {
    expect(
      parseNaiveUriToSingBoxOutbound("naive+https://alice:secret@example.com:443?sni=edge.example.com#work")
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

  it("defaults the port to 443 when it is omitted", () => {
    expect(parseNaiveUriToSingBoxOutbound("naive+https://alice:secret@example.com?sni=edge.example.com")).toEqual({
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

  it("enables quic for naive+quic URIs", () => {
    expect(parseNaiveUriToSingBoxOutbound("naive+quic://alice:secret@example.com:443?sni=edge.example.com")).toEqual({
      type: "naive",
      server: "example.com",
      server_port: 443,
      username: "alice",
      password: "secret",
      quic: true,
      tls: {
        enabled: true,
        server_name: "edge.example.com"
      }
    });
  });

  it("maps extra-headers into the outbound config", () => {
    expect(
      parseNaiveUriToSingBoxOutbound(
        "naive+https://alice:secret@example.com:443?extra-headers=Host%3A%20cdn.example.com%0D%0AX-Test%3A%201"
      )
    ).toEqual({
      type: "naive",
      server: "example.com",
      server_port: 443,
      username: "alice",
      password: "secret",
      extra_headers: {
        Host: "cdn.example.com",
        "X-Test": "1"
      },
      tls: {
        enabled: true,
        server_name: "example.com"
      }
    });
  });

  it("warns when padding is present but not applied to the generated config", () => {
    expect(validateNaiveConnectionUri("naive+https://alice:secret@example.com:443?padding=true")).toEqual([
      'Naive padding="true" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("adds udp_over_tcp only when explicitly enabled", () => {
    expect(
      withNaiveUdpOverTcp(
        parseNaiveUriToSingBoxOutbound("naive+https://alice:secret@example.com:443?sni=edge.example.com"),
        true
      )
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

  it("warns when padding is present with an empty value", () => {
    expect(validateNaiveConnectionUri("naive+https://alice:secret@example.com:443?padding=")).toEqual([
      'Naive padding="" is present in the provider URI but is not supported yet in the generated sing-box config.'
    ]);
  });

  it("rejects unsupported query parameters", () => {
    expect(() => parseNaiveUriToSingBoxOutbound("naive+https://alice:secret@example.com:443?foo=1")).toThrow(
      'Unsupported Naive query parameters: "foo".'
    );
  });

  it("rejects ip hosts without sni", () => {
    expect(() => parseNaiveUriToSingBoxOutbound("naive+https://alice:secret@203.0.113.10:443")).toThrow(
      "Naive URI using an IP address host must include sni for TLS."
    );
  });

  it("rejects invalid percent-encoding in the username with a friendly error", () => {
    expect(() => parseNaiveUriToSingBoxOutbound("naive+https://abc%zz:secret@example.com:443?sni=edge.example.com")).toThrow(
      "Connection URI contains invalid percent-encoding in the Naive username."
    );
  });
});
