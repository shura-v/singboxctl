# singboxctl

`singboxctl` currently supports macOS only.

`singboxctl` is a TUI for managing:

- Xray-compatible connection URIs
- routing profiles
- `sing-box` match rules

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
- Supported rule formats are currently `domain:...`, `domain_suffix:...`, and `ip_cidr:...`.
- `Profiles` select which rule sets should be active.
- `Select connection and profile` validates the selected connection with the built-in VLESS parser, writes a generated TUN config to `~/.config/singboxctl/config.json`, and refreshes the running service when needed.
- `Connect in terminal` starts `sing-box` in the foreground using the currently applied `~/.config/singboxctl/config.json` and prints logs in the current terminal. This is mainly useful for debugging.
- `Logs` opens or clears `/var/log/singboxctl.log` and lets you change the `sing-box` log level.
- `Auto-start in background` enables or disables running `sing-box` in the background now and on future startups.
