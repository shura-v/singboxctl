# singboxctl

`singboxctl` is a macOS TUI for managing:

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

Required:

- Homebrew

Install runtime dependencies with:

```bash
singboxctl install-mac-deps
```

This command installs:

- `go`
- `sing-box`
- `vpnparser`

After installation, `singboxctl` will tell you which Go bin directory to add to your `PATH`, for example `~/go/bin`.

## Run

Start the TUI with:

```bash
singboxctl
```

If `sing-box` or `vpnparser` are not available yet, the app will show an error telling you to run:

```bash
singboxctl install-mac-deps
```

## Current Menu

The current TUI includes:

- `Connect`
- `Disconnect`
- `Connections`
- `Profiles`
- `Rules`

## Notes

- `Connections` store raw Xray-compatible URIs.
- `Rules` are stored per profile.
- `Rules -> Add` uses a multiline prompt and expects one rule per line.
- `singboxctl` currently supports macOS only.
