import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildSystemdServiceUnit, createLinuxAppContext } from "./linux.js";
import { ensureDataDirectories, getGeneratedConfigPath } from "../store.js";

type CommandCall = { args: string[]; command: string };

describe("Linux systemd platform adapter", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-linux-test-"));
  });

  it("builds a systemd system service for the generated config", () => {
    const unit = buildSystemdServiceUnit(
      "/usr/local/bin/sing-box",
      "/home/test user/.config/singboxctl/config.json"
    );

    expect(unit).toContain('ExecStart="/usr/local/bin/sing-box" "run" "--disable-color" "-c"');
    expect(unit).toContain('"/home/test user/.config/singboxctl/config.json"');
    expect(unit).toContain("StandardOutput=append:/var/log/singboxctl.log");
    expect(unit).toContain("StandardError=append:/var/log/singboxctl.log");
    expect(unit).toContain("WantedBy=multi-user.target");
  });

  it("reports a clear prerequisite error when sing-box is missing", async () => {
    const context = createLinuxAppContext({
      pathResolver: async () => {
        throw new Error("missing");
      }
    });

    await expect(context.assertRuntimePrerequisitesInstalled()).rejects.toMatchObject({
      message: [
        "Linux prerequisites:",
        "- Install sing-box.",
        "- Ensure sing-box is available in PATH."
      ].join("\n")
    });
  });

  it("checks only sing-box during ordinary runtime startup", async () => {
    const resolvedCommands: string[] = [];
    const context = createLinuxAppContext({
      pathResolver: async (command) => {
        resolvedCommands.push(command);
        return "/usr/bin/sing-box";
      }
    });

    await expect(context.assertRuntimePrerequisitesInstalled()).resolves.toBeUndefined();
    expect(resolvedCommands).toEqual(["sing-box"]);
  });

  it("fails before service mutations when systemctl is missing", async () => {
    await writeGeneratedConfig();
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: async (command) => {
        if (command === "systemctl") {
          throw new Error("missing");
        }

        return `/usr/bin/${command}`;
      },
      streamingRunner: recordCalls(calls)
    });

    await expect(context.service.install()).rejects.toThrow("Linux service management requires systemctl in PATH.");
    expect(calls).toEqual([]);
  });

  it("requires sudo only before non-root privileged operations", async () => {
    await writeGeneratedConfig();
    const calls: CommandCall[] = [];
    const resolvedCommands: string[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: async (command) => {
        resolvedCommands.push(command);

        if (command === "sudo") {
          throw new Error("missing");
        }

        return `/usr/bin/${command}`;
      },
      streamingRunner: recordCalls(calls)
    });

    await expect(context.service.install()).rejects.toThrow(
      "This operation requires sudo in PATH when running as a non-root user."
    );
    expect(resolvedCommands).toEqual(["systemctl", "sing-box", "sudo"]);
    expect(calls).toEqual([]);
  });

  it("requires xdg-open only for open operations", async () => {
    const resolvedCommands: string[] = [];
    const context = createLinuxAppContext({
      pathResolver: async (command) => {
        resolvedCommands.push(command);

        if (command === "xdg-open") {
          throw new Error("missing");
        }

        return `/usr/bin/${command}`;
      },
      streamingRunner: async () => {
        throw new Error("must not run");
      }
    });

    await expect(context.assertRuntimePrerequisitesInstalled()).resolves.toBeUndefined();
    await expect(context.service.openConfigDirectory()).rejects.toThrow(
      "Opening files and directories requires xdg-open in PATH."
    );
    expect(resolvedCommands).toEqual(["sing-box", "xdg-open"]);
  });

  it("installs and starts the systemd service with narrow privileged commands", async () => {
    await writeGeneratedConfig();
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: recordCalls(calls)
    });

    const result = await context.service.install();

    expect(result).toMatchObject({
      configPath: getGeneratedConfigPath(),
      service: {
        definitionPath: "/etc/systemd/system/singboxctl.service",
        label: "singboxctl.service"
      }
    });
    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      {
        command: "sudo",
        args: [
          "install",
          "-o",
          "root",
          "-g",
          "root",
          "-m",
          "644",
          expect.stringContaining("singboxctl.service"),
          "/etc/systemd/system/singboxctl.service"
        ]
      },
      { command: "sudo", args: ["systemctl", "daemon-reload"] },
      { command: "sudo", args: ["systemctl", "enable", "singboxctl.service"] },
      { command: "sudo", args: ["rm", "-f", "/var/log/singboxctl.log"] },
      { command: "sudo", args: ["systemctl", "start", "singboxctl.service"] }
    ]);
  });

  it("rolls back enabled state without masking a startup failure", async () => {
    await writeGeneratedConfig();
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });

        if (command === "sudo" && args[0] === "systemctl" && args[1] === "start") {
          throw new Error("start failed");
        }

        if (command === "sudo" && args[0] === "systemctl" && args[1] === "disable") {
          throw new Error("rollback disable failed");
        }
      }
    });

    await expect(context.service.install()).rejects.toThrow("start failed");
    expect(calls.slice(-5)).toEqual([
      { command: "sudo", args: ["systemctl", "stop", "singboxctl.service"] },
      { command: "sudo", args: ["systemctl", "disable", "singboxctl.service"] },
      {
        command: "sudo",
        args: ["rm", "-f", "/etc/systemd/system/multi-user.target.wants/singboxctl.service"]
      },
      { command: "sudo", args: ["rm", "-f", "/etc/systemd/system/singboxctl.service"] },
      { command: "sudo", args: ["systemctl", "daemon-reload"] }
    ]);
  });

  it("removes a partially created enable symlink when enable fails", async () => {
    await writeGeneratedConfig();
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => false,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: async (command, args) => {
        calls.push({ command, args });

        if (command === "sudo" && args[0] === "systemctl" && args[1] === "enable") {
          throw new Error("enable failed after creating symlink");
        }
      }
    });

    await expect(context.service.install()).rejects.toThrow("enable failed after creating symlink");
    expect(calls.slice(-4)).toEqual([
      { command: "sudo", args: ["systemctl", "disable", "singboxctl.service"] },
      {
        command: "sudo",
        args: ["rm", "-f", "/etc/systemd/system/multi-user.target.wants/singboxctl.service"]
      },
      { command: "sudo", args: ["rm", "-f", "/etc/systemd/system/singboxctl.service"] },
      { command: "sudo", args: ["systemctl", "daemon-reload"] }
    ]);
  });

  it("reports active status and uninstalls the systemd service", async () => {
    const calls: CommandCall[] = [];
    let activeChecks = 0;
    const context = createLinuxAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        activeChecks += 1;
        return { code: activeChecks === 1 ? 0 : 1, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: recordCalls(calls)
    });

    await expect(context.service.getStatus()).resolves.toMatchObject({ installed: true, loaded: true });
    await expect(context.service.uninstall()).resolves.toBeUndefined();

    expect(calls).toEqual([
      { command: "systemctl", args: ["is-active", "--quiet", "singboxctl.service"] },
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["systemctl", "disable", "--now", "singboxctl.service"] },
      { command: "systemctl", args: ["is-active", "--quiet", "singboxctl.service"] },
      { command: "sudo", args: ["rm", "-f", "/etc/systemd/system/singboxctl.service"] },
      { command: "sudo", args: ["systemctl", "daemon-reload"] }
    ]);
  });

  it("restarts, disables, and stops an installed service", async () => {
    const calls: CommandCall[] = [];
    let activeChecks = 0;
    const context = createLinuxAppContext({
      captureRunner: async (command, args) => {
        calls.push({ command, args });
        activeChecks += 1;
        return { code: activeChecks === 1 ? 0 : 1, stderr: "", stdout: "" };
      },
      fileExistsChecker: async () => true,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: recordCalls(calls)
    });

    await expect(context.service.restartIfInstalled()).resolves.toBe(true);
    await expect(context.service.disableIfInstalled()).resolves.toBe(true);
    await expect(context.service.stopIfInstalled()).resolves.toBe(true);

    expect(calls).toEqual([
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["systemctl", "enable", "singboxctl.service"] },
      { command: "sudo", args: ["rm", "-f", "/var/log/singboxctl.log"] },
      { command: "sudo", args: ["systemctl", "restart", "singboxctl.service"] },
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["systemctl", "disable", "singboxctl.service"] },
      { command: "systemctl", args: ["is-active", "--quiet", "singboxctl.service"] },
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["systemctl", "stop", "singboxctl.service"] },
      { command: "systemctl", args: ["is-active", "--quiet", "singboxctl.service"] }
    ]);
  });

  it("opens config and logs with xdg-open and clears logs with sudo", async () => {
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      fileExistsChecker: async () => true,
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: recordCalls(calls)
    });

    await context.service.openConfigDirectory();
    await context.logs.open();
    await context.logs.clear();

    expect(calls).toEqual([
      { command: "xdg-open", args: [join(process.env.HOME!, ".config", "singboxctl")] },
      { command: "xdg-open", args: ["/var/log/singboxctl.log"] },
      { command: "sudo", args: ["-v"] },
      { command: "sudo", args: ["truncate", "-s", "0", "/var/log/singboxctl.log"] }
    ]);
  });

  it("runs foreground sing-box through sudo for a non-root process", async () => {
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      isRoot: () => false,
      pathResolver: resolveLinuxCommand,
      streamingRunner: recordCalls(calls)
    });

    const result = await context.runner.connect("/home/test/.config/singboxctl/config.json");

    expect(calls).toEqual([
      {
        command: "sudo",
        args: ["/usr/bin/sing-box", "run", "--disable-color", "-c", "/home/test/.config/singboxctl/config.json"]
      }
    ]);
    expect(result.command).toBe(
      "sudo /usr/bin/sing-box run --disable-color -c /home/test/.config/singboxctl/config.json"
    );
  });

  it("does not require sudo for root foreground connect", async () => {
    const calls: CommandCall[] = [];
    const context = createLinuxAppContext({
      isRoot: () => true,
      pathResolver: async (command) => {
        if (command === "sudo") {
          throw new Error("sudo must not be resolved");
        }

        return `/usr/bin/${command}`;
      },
      streamingRunner: recordCalls(calls)
    });

    await expect(context.runner.connect("/root/.config/singboxctl/config.json")).resolves.toEqual({
      command: "/usr/bin/sing-box run --disable-color -c /root/.config/singboxctl/config.json"
    });
    expect(calls).toEqual([
      {
        command: "/usr/bin/sing-box",
        args: ["run", "--disable-color", "-c", "/root/.config/singboxctl/config.json"]
      }
    ]);
  });
});

async function writeGeneratedConfig(): Promise<void> {
  await ensureDataDirectories();
  await writeFile(getGeneratedConfigPath(), '{"log":{"level":"error"}}\n', "utf8");
}

function recordCalls(calls: CommandCall[]): (command: string, args: string[]) => Promise<void> {
  return async (command, args) => {
    calls.push({ command, args });
  };
}

async function resolveLinuxCommand(command: string): Promise<string> {
  return `/usr/bin/${command}`;
}
