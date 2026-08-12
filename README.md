# singboxctl

[![CI](https://github.com/shura-v/singboxctl/actions/workflows/ci.yml/badge.svg)](https://github.com/shura-v/singboxctl/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/singboxctl.svg)](https://www.npmjs.com/package/singboxctl)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/shura-v/singboxctl/main/LICENSE)

![singboxctl TUI screenshot](https://raw.githubusercontent.com/shura-v/singboxctl/main/docs/usage.png)

`singboxctl` is a TUI for managing:

- Xray-compatible connection URIs
- routing profiles
- `sing-box` match rules

## Current Limitations

- Supported operating systems: macOS and Linux
- Connection import currently supports a narrow subset of these URI protocols:
  - `vless://`
  - `trojan://`
  - `hysteria2://`
  - `naive+https://`
  - `naive+quic://`
- Supported rule formats are currently `domain:...`, `domain_suffix:...`, and `ip_cidr:...`
- Unsupported URI or rule features fail explicitly instead of being guessed

### Supported URI subset

#### VLESS

Currently supported:

- `type=tcp`
- `security=none|reality`
- REALITY with `flow=xtls-rprx-vision`

Unsupported VLESS features fail explicitly.

#### Trojan

Currently supported:

- `type=tcp`
- `security=reality`
- REALITY with required `pbk` and `sni`
- optional `sid`
- optional `fp`

For Trojan URIs, the password is read from the URI userinfo segment:

`trojan://<password>@example.com:443?...`

Provider links in the wild may also include extra Trojan parameters such as `spx`. Provider-link fields are documented separately from guaranteed generated `sing-box` runtime support: if a field is not listed above in the supported subset, do not assume it is applied to `config.json` just because it appears in a provider URI.

Currently, `spx` is accepted with a warning and is not applied to the generated `sing-box` config.

Unsupported Trojan features fail explicitly.

#### Hysteria2

Currently supported:

- `security=tls`
- optional `sni`
- `alpn=h2|h3`

For Hysteria2 URIs, the auth value is read from the URI userinfo segment:

`hysteria2://<auth>@example.com:443?...`

Provider links in the wild may also include extra Hysteria2 parameters such as `fp`. Provider-link fields are documented separately from guaranteed generated `sing-box` runtime support: if a field is not listed above in the supported subset, do not assume it is applied to `config.json` just because it appears in a provider URI.

Unsupported Hysteria2 features fail explicitly.

#### Naive

Currently supported:

- `naive+https://` and `naive+quic://`
- username and password in URI userinfo
- optional `sni`
- optional `extra-headers`
- optional generated `udp_over_tcp: true` when enabled during `Select connection and profile`

For Naive URIs, the auth values are read from the URI userinfo segment:

`naive+https://<username>:<password>@example.com:443?...`

Provider links in the wild may also include extra Naive parameters such as `padding`. Provider-link fields are documented separately from guaranteed generated `sing-box` runtime support: if a field is not listed above in the supported subset, do not assume it is applied to `config.json` just because it appears in a provider URI.

Currently, `padding` is accepted with a warning and is not applied to the generated `sing-box` config.

Unsupported Naive features fail explicitly.

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

### Linux

- Install `sing-box` using its official package instructions: https://sing-box.sagernet.org/installation/package-manager/
- Background service management requires a running systemd and `systemctl`.
- Non-root service management requires `sudo`.
- Opening files and directories requires `xdg-open`, usually provided by `xdg-utils`.

`singboxctl` installs and manages its own `singboxctl.service` system service. If the package-provided service is active, disable it first to avoid competing TUN interfaces:

```bash
sudo systemctl disable --now sing-box
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

Generate a config for a specific profile using the active connection:

```bash
singboxctl generate main
singboxctl generate main ./artifacts/router-config.json
```

The optional output path creates missing parent directories. Generation requires the saved active connection and requested profile, but does not require the local `sing-box` runtime, change the active profile, or restart the service.

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
- `Select connection and profile` validates the selected connection with the built-in URI parsers, writes a generated TUN config to `~/.config/singboxctl/config.json`, and refreshes the running service when needed.
- `generate <profile> [output-path]` uses the active connection and writes the selected profile's config to the standard path or an explicit path without changing the active selection.
- `Connect in terminal` starts `sing-box` in the foreground using the currently applied `~/.config/singboxctl/config.json` and prints logs in the current terminal. This is mainly useful for debugging.
- `Logs` opens or clears `/var/log/singboxctl.log` and lets you change the `sing-box` log level. On Linux, the file opens through the default desktop application registered with `xdg-open`.
- `Auto-start in background` enables or disables running `sing-box` in the background now and on future startups.
