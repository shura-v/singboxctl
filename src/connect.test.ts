import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext, ServiceStatus } from "./app-context.js";
import { ensureDataDirectories, getGeneratedConfigPath } from "./store.js";
import { buildSingBoxRunInvocation, connect } from "./connect.js";

function makeServiceStatus(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    configPath: "/Users/test/.config/singboxctl/config.json",
    installed: false,
    loaded: false,
    service: {
      configDirectoryViewerName: "Finder",
      definitionLabel: "Plist",
      definitionPath: "/Library/LaunchDaemons/io.shura.singboxctl.plist",
      displayName: "launchd service",
      label: "io.shura.singboxctl",
      logPath: "/var/log/singboxctl.log",
      logViewerName: "Console",
      privilegePrompt: "macOS password"
    },
    ...overrides
  };
}

describe("connect module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-run-test-"));
  });

  const context: Pick<AppContext, "service"> = {
    service: {
      clearLogs: async () => {},
      disableIfInstalled: async () => false,
      getInfo: () => makeServiceStatus().service,
      getStatus: async () => makeServiceStatus(),
      install: async () => {
        throw new Error("not used");
      },
      openConfigDirectory: async () => {},
      openLogs: async () => {},
      restartIfInstalled: async () => false,
      stopIfInstalled: async () => false,
      uninstall: async () => {}
    }
  };

  it("starts sing-box with the existing generated config", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];

    const result = await connect(
      context,
      async (command, args) => {
        calls.push({ command, args });
      },
      async () => "/opt/homebrew/bin/sing-box",
      async () => makeServiceStatus()
    );

    expect(calls).toHaveLength(1);
    expect(result.configPath).toBe(configPath);
    expect(calls[0]).toEqual(buildSingBoxRunInvocation(result.configPath, "/opt/homebrew/bin/sing-box"));
  });

  it("fails when config.json does not exist yet", async () => {
    await expect(
      connect(context, async () => {}, async () => "/opt/homebrew/bin/sing-box", async () => makeServiceStatus())
    ).rejects.toThrow("Config not found. Use Select & Apply first.");
  });

  it("refuses foreground connect when the background service is already loaded", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    await expect(
      connect(
        context,
        async () => {},
        async () => "/opt/homebrew/bin/sing-box",
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
