import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureDataDirectories, getGeneratedConfigPath } from "./store.js";
import { buildSingBoxRunInvocation, connect } from "./connect.js";
import type { ServiceStatus } from "./service.js";

function makeServiceStatus(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    configPath: "/Users/test/.config/singboxctl/config.json",
    installed: false,
    label: "io.shura.singboxctl",
    loaded: false,
    plistPath: "/Library/LaunchDaemons/io.shura.singboxctl.plist",
    ...overrides
  };
}

describe("connect module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-run-test-"));
  });

  it("starts sing-box with the existing generated config", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];

    const result = await connect(
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
      connect(async () => {}, async () => "/opt/homebrew/bin/sing-box", async () => makeServiceStatus())
    ).rejects.toThrow("Config not found. Use Select & Apply first.");
  });

  it("refuses foreground connect when the launchd service is already loaded", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"info"}}\n', "utf8");

    await expect(
      connect(
        async () => {},
        async () => "/opt/homebrew/bin/sing-box",
        async () =>
          makeServiceStatus({
            installed: true,
            loaded: true
          })
      )
    ).rejects.toThrow(
      'Launchd service "io.shura.singboxctl" is already running. Stop or remove it before using foreground connect.'
    );
  });
});
