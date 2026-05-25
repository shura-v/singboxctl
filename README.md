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

- `Connect`
- `Select & Apply`
- `Connections`
- `Profiles`
- `Rule Sets`
- `Service`

## Notes

- `Connections` store raw Xray-compatible URIs.
- `Rule Sets` store named groups of rules. The rule-set file name is the source of truth for the rule-set name.
- Supported rule formats are currently `domain:...`, `domain_suffix:...`, and `ip_cidr:...`.
- `Profiles` select which rule sets should be active.
- `Select & Apply` validates the selected connection with the built-in VLESS parser and writes a generated TUN config to `~/.config/singboxctl/config.json`.
- `Connect` starts `sing-box` in the foreground using the currently applied `~/.config/singboxctl/config.json`.
- `Service` installs or removes a `launchd` daemon for starting `sing-box` at boot.
