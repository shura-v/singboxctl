import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureDataDirectories, getGeneratedConfigPath } from "./store.js";
import {
  buildLaunchDaemonPlist,
  disableServiceIfInstalled,
  getServiceStatus,
  installService,
  restartServiceIfInstalled,
  stopServiceIfInstalled
} from "./service.js";

describe("service module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-service-test-"));
  });

  it("builds a launchd plist for sing-box", () => {
    const plist = buildLaunchDaemonPlist("/opt/homebrew/bin/sing-box", "/Users/test/.config/singboxctl/config.json");

    expect(plist).toContain("<string>/opt/homebrew/bin/sing-box</string>");
    expect(plist).toContain("<string>/Users/test/.config/singboxctl/config.json</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  it("installs the service using privileged commands", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"error"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];

    const result = await installService(
      async (command, args) => {
        calls.push({ command, args });
      },
      async () => "/opt/homebrew/bin/sing-box",
      () => false
    );

    expect(result.configPath).toBe(configPath);
    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["-v"]
      },
      {
        command: "sudo",
        args: ["cp", expect.stringContaining("io.shura.singboxctl.plist"), "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["chown", "root:wheel", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["chmod", "644", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["launchctl", "enable", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "bootstrap", "system", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      }
    ]);
  });

  it("removes the copied plist when bootstrap fails", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"error"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];

    await expect(
      installService(
        async (command, args) => {
          calls.push({ command, args });

          if (command === "sudo" && args[0] === "launchctl" && args[1] === "bootstrap") {
            throw new Error("bootstrap failed");
          }
        },
        async () => "/opt/homebrew/bin/sing-box",
        () => false
      )
    ).rejects.toThrow("bootstrap failed");

    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["-v"]
      },
      {
        command: "sudo",
        args: ["cp", expect.stringContaining("io.shura.singboxctl.plist"), "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["chown", "root:wheel", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["chmod", "644", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["launchctl", "enable", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "bootstrap", "system", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      },
      {
        command: "sudo",
        args: ["rm", "-f", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      }
    ]);
  });

  it("reports a missing service as not installed", async () => {
    const status = await getServiceStatus(async () => {}, async () => ({ code: 1, stderr: "", stdout: "" }), () => false);

    expect(status).toMatchObject({
      installed: false,
      loaded: false,
      label: "io.shura.singboxctl",
      plistPath: "/Library/LaunchDaemons/io.shura.singboxctl.plist"
    });
  });

  it("does not restart a missing service", async () => {
    await expect(
      restartServiceIfInstalled(
        async () => {},
        async () => ({ code: 1, stderr: "", stdout: "" }),
        () => false,
        async () => false
      )
    ).resolves.toBe(false);
  });

  it("kickstarts a loaded installed service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];

    const restarted = await restartServiceIfInstalled(
      async (command, args) => {
        calls.push({ command, args });
      },
      async (command, args) => {
        calls.push({ command, args });
        return { code: 0, stderr: "", stdout: "" };
      },
      () => false,
      async () => true
    );

    expect(restarted).toBe(true);
    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["-v"]
      },
      {
        command: "sudo",
        args: ["launchctl", "enable", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "print", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "kickstart", "-k", "system/io.shura.singboxctl"]
      }
    ]);
  });

  it("bootstraps an installed but unloaded service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];

    const restarted = await restartServiceIfInstalled(
      async (command, args) => {
        calls.push({ command, args });
      },
      async (command, args) => {
        calls.push({ command, args });
        return { code: 1, stderr: "", stdout: "" };
      },
      () => false,
      async () => true
    );

    expect(restarted).toBe(true);
    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["-v"]
      },
      {
        command: "sudo",
        args: ["launchctl", "enable", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "print", "system/io.shura.singboxctl"]
      },
      {
        command: "sudo",
        args: ["launchctl", "bootstrap", "system", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
      }
    ]);
  });

  it("does not stop a missing service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];

    const stopped = await stopServiceIfInstalled(
      async (command, args) => {
        calls.push({ command, args });
      },
      async (command, args) => {
        calls.push({ command, args });
        return { code: 0, stderr: "", stdout: "" };
      },
      () => false,
      async () => false
    );

    expect(stopped).toBe(false);
    expect(calls).toEqual([]);
  });

  it("disables an installed service without removing its plist", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];

    const disabled = await disableServiceIfInstalled(
      async (command, args) => {
        calls.push({ command, args });
      },
      () => false,
      async () => true
    );

    expect(disabled).toBe(true);
    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["-v"]
      },
      {
        command: "sudo",
        args: ["launchctl", "disable", "system/io.shura.singboxctl"]
      }
    ]);
  });
});
