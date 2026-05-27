# singboxctl

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
