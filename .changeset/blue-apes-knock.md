---
"singboxctl": minor
---

Add narrow `hysteria2://` URI support alongside the existing VLESS flow.

This release adds:

- a dedicated Hysteria2 URI parser and shared connection-scheme dispatch
- generated `sing-box` outbound support for a narrow Hysteria2 subset
- explicit validation for unsupported or ambiguous Hysteria2 URI fields
- user-facing warnings when provider-only fields such as `fp` are present but not supported yet in generated config

