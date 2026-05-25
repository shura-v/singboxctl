# AGENTS

## Project Rules

- We add features sequentially in small steps.
- Do not implement speculative functionality that was not explicitly requested.
- Do not write custom VPN URI or config parsers in this project.
- If we need to turn an Xray-compatible VPN URI into a config file, use the installed `vpnparser` dependency.
- Prefer integrating with `vpnparser` over duplicating protocol parsing logic in TypeScript.
