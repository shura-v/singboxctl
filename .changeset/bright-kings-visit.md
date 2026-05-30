---
"singboxctl": minor
---

Add narrow `naive+https://` and `naive+quic://` URI support.

This release adds:

- a dedicated Naive URI parser and shared connection-scheme dispatch
- generated `sing-box` outbound support for a narrow Naive subset
- a `Select connection and profile` prompt for enabling Naive `udp_over_tcp` when needed
- explicit validation for unsupported or ambiguous Naive URI fields
- user-facing warnings when provider-only fields such as `padding` are present but not supported yet in generated config
