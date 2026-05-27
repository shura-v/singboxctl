import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildLaunchDaemonPlist, createMacOSAppContext } from "./platform/macos.js";
import { ensureDataDirectories, getGeneratedConfigPath } from "./store.js";

describe("service module", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-service-test-"));
  });

  it("builds a launchd plist for sing-box", () => {
    const plist = buildLaunchDaemonPlist("/opt/homebrew/bin/sing-box", "/Users/test/.config/singboxctl/config.json");

    expect(plist).toContain("<string>/opt/homebrew/bin/sing-box</string>");
    expect(plist).toContain("<string>--disable-color</string>");
    expect(plist).toContain("<string>/Users/test/.config/singboxctl/config.json</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  it("installs the service using privileged commands", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"error"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: async () => "/opt/homebrew/bin/sing-box",
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    const result = await context.service.install();

    expect(result.configPath).toBe(configPath);
    expect(result.service.definitionPath).toBe("/Library/LaunchDaemons/io.shura.singboxctl.plist");
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["cp", expect.stringContaining("io.shura.singboxctl.plist"), "/Library/LaunchDaemons/io.shura.singboxctl.plist"] },
      { command: "sudo", args: ["chown", "root:wheel", "/Library/LaunchDaemons/io.shura.singboxctl.plist"] },
      { command: "sudo", args: ["chmod", "644", "/Library/LaunchDaemons/io.shura.singboxctl.plist"] },
      { command: "sudo", args: ["launchctl", "enable", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["rm", "-f", "/var/log/singboxctl.log"] },
      { command: "sudo", args: ["launchctl", "bootstrap", "system", "/Library/LaunchDaemons/io.shura.singboxctl.plist"] }
    ]);
  });

  it("removes the copied plist when bootstrap fails", async () => {
    await ensureDataDirectories();
    const configPath = getGeneratedConfigPath();
    await writeFile(configPath, '{"log":{"level":"error"}}\n', "utf8");

    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: async () => "/opt/homebrew/bin/sing-box",
      streamingRunner: async (command, args) => {
        calls.push({ command, args });

        if (command === "sudo" && args[0] === "launchctl" && args[1] === "bootstrap") {
          throw new Error("bootstrap failed");
        }
      }
    });

    await expect(context.service.install()).rejects.toThrow("bootstrap failed");

    expect(calls[calls.length - 1]).toEqual({
      command: "sudo",
      args: ["rm", "-f", "/Library/LaunchDaemons/io.shura.singboxctl.plist"]
    });
  });

  it("reports a missing service as not installed", async () => {
    const context = createMacOSAppContext({
      captureRunner: async () => ({ code: 1, stderr: "", stdout: "" }),
      fileExistsChecker: async () => false,
      isRoot: () => false,
      streamingRunner: async () => {}
    });

    const status = await context.service.getStatus();

    expect(status).toMatchObject({
      installed: false,
      loaded: false,
      service: {
        label: "io.shura.singboxctl",
        definitionPath: "/Library/LaunchDaemons/io.shura.singboxctl.plist"
      }
    });
  });

  it("uninstalls the service using the injected file existence checker", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        return { code: 1, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await expect(context.service.uninstall()).resolves.toBeUndefined();
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["launchctl", "bootout", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["launchctl", "print", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["rm", "-f", "/Library/LaunchDaemons/io.shura.singboxctl.plist"] }
    ]);
  });

  it("opens the service log in Console when the log file exists", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => true,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await context.logs.open();

    expect(calls).toEqual([{ command: "open", args: ["-a", "Console", "/var/log/singboxctl.log"] }]);
  });

  it("fails clearly when the service log file is missing", async () => {
    const context = createMacOSAppContext({
      fileExistsChecker: async () => false,
      streamingRunner: async () => {}
    });

    await expect(context.logs.open()).rejects.toThrow("Service log not found at /var/log/singboxctl.log.");
  });

  it("opens the generated config directory in Finder", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await context.service.openConfigDirectory();

    expect(calls).toEqual([{ command: "open", args: [join(process.env.HOME!, ".config", "singboxctl")] }]);
  });

  it("runs foreground sing-box through the injected runtime runner", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      isRoot: () => false,
      pathResolver: async () => "/opt/homebrew/bin/sing-box",
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    const result = await context.runner.connect("/Users/test/.config/singboxctl/config.json");

    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["/opt/homebrew/bin/sing-box", "run", "--disable-color", "-c", "/Users/test/.config/singboxctl/config.json"]
      }
    ]);
    expect(result.command).toBe(
      "sudo /opt/homebrew/bin/sing-box run --disable-color -c /Users/test/.config/singboxctl/config.json"
    );
  });

  it("clears the service log using a privileged truncate command", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await context.logs.clear();

    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["truncate", "-s", "0", "/var/log/singboxctl.log"] }
    ]);
  });

  it("does nothing when clearing service logs and the log file is missing", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await context.logs.clear();
    expect(calls).toEqual([]);
  });

  it("does not restart a missing service", async () => {
    const context = createMacOSAppContext({
      captureRunner: async () => ({ code: 1, stderr: "", stdout: "" }),
      fileExistsChecker: async () => false,
      isRoot: () => false,
      streamingRunner: async () => {}
    });

    await expect(context.service.restartIfInstalled()).resolves.toBe(false);
  });

  it("kickstarts a loaded installed service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        return { code: 0, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await expect(context.service.restartIfInstalled()).resolves.toBe(true);
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["launchctl", "enable", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["launchctl", "print", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["rm", "-f", "/var/log/singboxctl.log"] },
      { command: "sudo", args: ["launchctl", "kickstart", "-k", "system/io.shura.singboxctl"] }
    ]);
  });

  it("bootstraps an installed but unloaded service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        return { code: 1, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await expect(context.service.restartIfInstalled()).resolves.toBe(true);
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["launchctl", "enable", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["launchctl", "print", "system/io.shura.singboxctl"] },
      { command: "sudo", args: ["rm", "-f", "/var/log/singboxctl.log"] },
      { command: "sudo", args: ["launchctl", "bootstrap", "system", "/Library/LaunchDaemons/io.shura.singboxctl.plist"] }
    ]);
  });

  it("returns false when stopping an installed but unloaded service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        return { code: 1, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await expect(context.service.stopIfInstalled()).resolves.toBe(false);
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["launchctl", "print", "system/io.shura.singboxctl"] }
    ]);
  });

  it("disables an installed service", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const context = createMacOSAppContext({
      fileExistsChecker: async () => true,
      isRoot: () => false,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });
      }
    });

    await expect(context.service.disableIfInstalled()).resolves.toBe(true);
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["launchctl", "disable", "system/io.shura.singboxctl"] }
    ]);
  });
});
