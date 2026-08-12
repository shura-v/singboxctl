# singboxctl

## 0.5.0

### Minor Changes

- f8f0ffa: Add Linux support with capability-based checks and systemd background service management.

## 0.4.0

### Minor Changes

- 257c97b: Add `singboxctl generate <profile> [output-path]` for non-interactive config generation.

## 0.3.2

### Patch Changes

- 83f5669: Allow profiles with deleted rule sets to be saved again using their remaining rule sets.

## 0.3.1

### Patch Changes

- 2b14ba6: Add narrow Trojan REALITY TCP URI import support.

## 0.3.0

### Minor Changes

- 638c1f9: Add narrow `naive+https://` and `naive+quic://` URI support.

  This release adds:

  - a dedicated Naive URI parser and shared connection-scheme dispatch
  - generated `sing-box` outbound support for a narrow Naive subset
  - a `Select connection and profile` prompt for enabling Naive `udp_over_tcp` when needed
  - explicit validation for unsupported or ambiguous Naive URI fields
  - user-facing warnings when provider-only fields such as `padding` are present but not supported yet in generated config

## 0.2.0

### Minor Changes

- 795d047: Add narrow `hysteria2://` URI support alongside the existing VLESS flow.

  This release adds:

  - a dedicated Hysteria2 URI parser and shared connection-scheme dispatch
  - generated `sing-box` outbound support for a narrow Hysteria2 subset
  - explicit validation for unsupported or ambiguous Hysteria2 URI fields
  - user-facing warnings when provider-only fields such as `fp` are present but not supported yet in generated config

## 0.1.1

### Patch Changes

- 7ec97c0: Move the IPv6 menu item below Rule Sets in the root TUI menu for a clearer management section order.

## 0.1.0

### Minor Changes

- 78c440f: Initial public release of `singboxctl` as a macOS-focused TUI for `sing-box`.

  Current scope:

  - manage Xray-compatible connection URIs, routing profiles, and `sing-box` match rules
  - import a narrow supported subset of `vless://` URIs
  - fail explicitly for unsupported URI or rule features
