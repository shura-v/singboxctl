# singboxctl

[![CI](https://github.com/shura-v/singboxctl/actions/workflows/ci.yml/badge.svg)](https://github.com/shura-v/singboxctl/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/singboxctl.svg)](https://www.npmjs.com/package/singboxctl)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![singboxctl TUI screenshot](https://raw.githubusercontent.com/shura-v/singboxctl/main/docs/usage.png)

`singboxctl` is a TUI for managing:

- Xray-compatible connection URIs
- routing profiles
- `sing-box` match rules

## Current Limitations

### singboxctl limitations

- macOS only
- connection import currently supports `vless://` URIs only
- supported rule formats are currently `domain:...`, `domain_suffix:...`, and `ip_cidr:...`
- unsupported URI or rule features fail explicitly instead of being guessed

### Current sing-box-related subset

- connection import currently supports a narrow VLESS URI subset
- currently supported VLESS URI subset: `type=tcp`, `security=none|reality`, and REALITY `flow=xtls-rprx-vision`

## Install

Install the CLI globally:

```bash
npm install -g singboxctl
```

## Prerequisites

### macOS

- Install Homebrew: https://brew.sh/
- Install `sing-box` with:

```bash
brew install sing-box
```

## Run

Start the TUI with:

```bash
singboxctl
```

Or start `sing-box` directly with the currently applied config:

```bash
singboxctl connect
```

If `sing-box` is not available yet, the app will show an error with installation hints.

## Current Menu

The current TUI includes:

- `Auto-start in background`
- `Connect in terminal`
- `Select connection and profile`
- `Connections`
- `Profiles`
- `Rule Sets`
- `IPv6`
- `Logs`

## Notes

- `Connections` store raw Xray-compatible URIs.
- `Rule Sets` store named groups of rules. The rule-set file name is the source of truth for the rule-set name.
- `Profiles` select which rule sets should be active.
- `Select connection and profile` validates the selected connection with the built-in VLESS parser, writes a generated TUN config to `~/.config/singboxctl/config.json`, and refreshes the running service when needed.
- `Connect in terminal` starts `sing-box` in the foreground using the currently applied `~/.config/singboxctl/config.json` and prints logs in the current terminal. This is mainly useful for debugging.
- `Logs` opens or clears `/var/log/singboxctl.log` and lets you change the `sing-box` log level.
- `Auto-start in background` enables or disables running `sing-box` in the background now and on future startups.
