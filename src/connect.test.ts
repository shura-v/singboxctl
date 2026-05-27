import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext, ServiceStatus } from "./app-context.js";
import { connect } from "./connect.js";
import { ensureDataDirectories, getGeneratedConfigPath } from "./store.js";

function makeServiceStatus(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    configPath: "/Users/test/.config/singboxctl/config.json",
    installed: false,
    loaded: false,
    service: {
      definitionLabel: "Plist",
      definitionPath: "/Library/LaunchDaemons/io.shura.singboxctl.plist",
      configDirectoryViewerName: "Finder",
      displayName: "launchd service",
      label: "io.shura.singboxctl",
      privilegePrompt: "macOS password"
    },
    ...overrides
  };
}

describe("connect module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-run-test-"));
  });

  const context: Pick<AppContext, "runner" | "service"> = {
    runner: {
      connect: async () => ({ command: "sudo /opt/homebrew/bin/sing-box run --disable-color -c /tmp/config.json" })
    },
    service: {
      disableIfInstalled: async () => false,
      getInfo: () => makeServiceStatus().service,
      getStatus: async () => makeServiceStatus(),
      install: async () => {
        throw new Error("not used");
      },
      openConfigDirectory: async () => {},
      restartIfInstalled: async () => false,
      stopIfInstalled: async () => false,
      uninstall: async () => {}
    }
  };

  it("starts sing-box with the existing generated config", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    const calls: string[] = [];
    const contextWithRunner: Pick<AppContext, "runner" | "service"> = {
      ...context,
      runner: {
        connect: async (configPath) => {
          calls.push(configPath);
          return {
            command: `sudo /opt/homebrew/bin/sing-box run --disable-color -c ${configPath}`
          };
        }
      }
    };

    const result = await connect(contextWithRunner, async () => makeServiceStatus());

    expect(calls).toHaveLength(1);
    expect(result.configPath).toBe(configPath);
    expect(calls[0]).toBe(result.configPath);
    expect(result.command).toBe(`sudo /opt/homebrew/bin/sing-box run --disable-color -c ${configPath}`);
  });

  it("fails when config.json does not exist yet", async () => {
    await expect(connect(context, async () => makeServiceStatus())).rejects.toThrow(
      "Config not found. Use Select & Apply first."
    );
  });

  it("refuses foreground connect when the background service is already loaded", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    await expect(
      connect(
        context,
        async () =>
          makeServiceStatus({
            installed: true,
            loaded: true
          })
      )
    ).rejects.toThrow(
      'launchd service "io.shura.singboxctl" is already running. Stop or remove it before using foreground connect.'
    );
  });
});
