import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FriendlyMessageError } from "../cli.js";
import type {
  AppContext,
  AppService,
  DesktopOpener,
  ServiceInstallResult,
  ServiceManagerInfo,
  ServiceStatus
} from "../app-context.js";
import { runCommandCapture, runCommandStreaming, resolveCommandPath, type CommandResult } from "../process.js";
import { getGeneratedConfigPath } from "../store.js";

type StreamingRunner = (command: string, args: string[]) => Promise<void>;
type CaptureRunner = (command: string, args: string[]) => Promise<CommandResult>;
type PathResolver = (command: string) => Promise<string>;
type IsRoot = () => boolean;
type FileExistsChecker = (filePath: string) => Promise<boolean>;

const MAC_PREREQUISITES_MESSAGE = [
  "macOS prerequisites:",
  "- Install Homebrew if needed: https://brew.sh/",
  "- Install sing-box with Homebrew:",
  "  brew install sing-box"
].join("\n");

const SERVICE_LABEL = "io.shura.singboxctl";
const SERVICE_PLIST_PATH = `/Library/LaunchDaemons/${SERVICE_LABEL}.plist`;
const SERVICE_LOG_PATH = "/var/log/singboxctl.log";

export type MacOSPlatformRuntimeOptions = {
  captureRunner?: CaptureRunner;
  fileExistsChecker?: FileExistsChecker;
  isRoot?: IsRoot;
  pathResolver?: PathResolver;
  streamingRunner?: StreamingRunner;
};

export class MacOSDesktopOpener implements DesktopOpener {
  constructor(private readonly streamingRunner: StreamingRunner = runCommandStreaming) {}

  async openDirectory(directoryPath: string): Promise<void> {
    await this.streamingRunner("open", [directoryPath]);
  }

  async openFile(filePath: string): Promise<void> {
    await this.streamingRunner("open", [filePath]);
  }

  async openServiceLogs(logPath: string): Promise<void> {
    await this.streamingRunner("open", ["-a", "Console", logPath]);
  }
}

export class MacOSServiceManager implements AppService {
  private readonly desktopOpener: DesktopOpener;

  constructor(
    private readonly options: MacOSPlatformRuntimeOptions & {
      desktopOpener?: DesktopOpener;
    } = {}
  ) {
    this.desktopOpener = options.desktopOpener ?? new MacOSDesktopOpener(options.streamingRunner);
  }

  getInfo(): ServiceManagerInfo {
    return {
      configDirectoryViewerName: "Finder",
      definitionLabel: "Plist",
      definitionPath: SERVICE_PLIST_PATH,
      displayName: "launchd service",
      label: SERVICE_LABEL,
      logPath: SERVICE_LOG_PATH,
      logViewerName: "Console",
      privilegePrompt: "macOS password"
    };
  }

  async openLogs(): Promise<void> {
    const { logPath } = this.getInfo();

    if (!(await this.fileExistsChecker()(logPath))) {
      throw new FriendlyMessageError(`Service log not found at ${logPath}.`);
    }

    await this.desktopOpener.openServiceLogs(logPath);
  }

  async openConfigDirectory(): Promise<void> {
    await this.desktopOpener.openDirectory(dirname(getGeneratedConfigPath()));
  }

  async clearLogs(): Promise<void> {
    const { logPath } = this.getInfo();

    if (!(await this.fileExistsChecker()(logPath))) {
      return;
    }

    await ensureSudoSession(this.streamingRunner(), this.isRoot());
    await runPrivilegedStreaming("truncate", ["-s", "0", logPath], this.streamingRunner(), this.isRoot());
  }

  async install(): Promise<ServiceInstallResult> {
    const service = this.getInfo();
    const configPath = getGeneratedConfigPath();
    await assertConfigExists(configPath);

    if (await this.fileExistsChecker()(service.definitionPath)) {
      throw new FriendlyMessageError("Service is already installed.");
    }

    const singBoxPath = await this.pathResolver()("sing-box");
    const plist = buildLaunchDaemonPlist(singBoxPath, configPath);
    const tempDir = await mkdtemp(join(tmpdir(), "singboxctl-service-"));
    const tempPlistPath = join(tempDir, `${service.label}.plist`);
    let copiedPlist = false;

    try {
      await writeFile(tempPlistPath, plist, "utf8");
      await ensureSudoSession(this.streamingRunner(), this.isRoot());
      await runPrivilegedStreaming("cp", [tempPlistPath, service.definitionPath], this.streamingRunner(), this.isRoot());
      copiedPlist = true;
      await runPrivilegedStreaming("chown", ["root:wheel", service.definitionPath], this.streamingRunner(), this.isRoot());
      await runPrivilegedStreaming("chmod", ["644", service.definitionPath], this.streamingRunner(), this.isRoot());
      await runPrivilegedStreaming("launchctl", ["enable", `system/${service.label}`], this.streamingRunner(), this.isRoot());
      await clearServiceLogBeforeStart(this.streamingRunner(), this.isRoot(), service.logPath);
      await runPrivilegedStreaming(
        "launchctl",
        ["bootstrap", "system", service.definitionPath],
        this.streamingRunner(),
        this.isRoot()
      );
    } catch (error) {
      if (copiedPlist) {
        await runPrivilegedStreaming("rm", ["-f", service.definitionPath], this.streamingRunner(), this.isRoot());
      }

      throw error;
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }

    return {
      configPath,
      service
    };
  }

  async uninstall(): Promise<void> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      throw new FriendlyMessageError("Service is not installed.");
    }

    await ensureSudoSession(this.streamingRunner(), this.isRoot());
    await runPrivilegedCapture("launchctl", ["bootout", `system/${service.label}`], this.captureRunner(), this.isRoot());
    const loadedAfterBootout = await isServiceLoaded(this.captureRunner(), this.isRoot(), service.label);

    if (loadedAfterBootout) {
      throw new FriendlyMessageError("Service is still loaded after bootout. Try removing it again.");
    }

    await runPrivilegedStreaming("rm", ["-f", service.definitionPath], this.streamingRunner(), this.isRoot());
  }

  async getStatus(): Promise<ServiceStatus> {
    const service = this.getInfo();
    const installed = await this.fileExistsChecker()(service.definitionPath);
    let loaded = false;

    if (installed) {
      await ensureSudoSession(this.streamingRunner(), this.isRoot());
      const result = await runPrivilegedCapture(
        "launchctl",
        ["print", `system/${service.label}`],
        this.captureRunner(),
        this.isRoot()
      );
      loaded = result.code === 0;
    }

    return {
      configPath: getGeneratedConfigPath(),
      installed,
      loaded,
      service
    };
  }

  async restartIfInstalled(): Promise<boolean> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      return false;
    }

    await ensureSudoSession(this.streamingRunner(), this.isRoot());
    await runPrivilegedStreaming("launchctl", ["enable", `system/${service.label}`], this.streamingRunner(), this.isRoot());

    if (await isServiceLoaded(this.captureRunner(), this.isRoot(), service.label)) {
      await clearServiceLogBeforeStart(this.streamingRunner(), this.isRoot(), service.logPath);
      await runPrivilegedStreaming(
        "launchctl",
        ["kickstart", "-k", `system/${service.label}`],
        this.streamingRunner(),
        this.isRoot()
      );
      return true;
    }

    await clearServiceLogBeforeStart(this.streamingRunner(), this.isRoot(), service.logPath);
    await runPrivilegedStreaming(
      "launchctl",
      ["bootstrap", "system", service.definitionPath],
      this.streamingRunner(),
      this.isRoot()
    );
    return true;
  }

  async disableIfInstalled(): Promise<boolean> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      return false;
    }

    await ensureSudoSession(this.streamingRunner(), this.isRoot());
    await runPrivilegedStreaming("launchctl", ["disable", `system/${service.label}`], this.streamingRunner(), this.isRoot());
    return true;
  }

  async stopIfInstalled(): Promise<boolean> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      return false;
    }

    await ensureSudoSession(this.streamingRunner(), this.isRoot());

    if (!(await isServiceLoaded(this.captureRunner(), this.isRoot(), service.label))) {
      return false;
    }

    await runPrivilegedCapture("launchctl", ["bootout", `system/${service.label}`], this.captureRunner(), this.isRoot());
    const loadedAfterBootout = await isServiceLoaded(this.captureRunner(), this.isRoot(), service.label);

    if (loadedAfterBootout) {
      throw new FriendlyMessageError("Service is still loaded after bootout. Try stopping it again.");
    }

    return true;
  }

  private captureRunner(): CaptureRunner {
    return this.options.captureRunner ?? runCommandCapture;
  }

  private fileExistsChecker(): FileExistsChecker {
    return this.options.fileExistsChecker ?? fileExists;
  }

  private isRoot(): IsRoot {
    return this.options.isRoot ?? isProcessRoot;
  }

  private pathResolver(): PathResolver {
    return this.options.pathResolver ?? resolveCommandPath;
  }

  private streamingRunner(): StreamingRunner {
    return this.options.streamingRunner ?? runCommandStreaming;
  }
}

export function createMacOSAppContext(options: MacOSPlatformRuntimeOptions = {}): AppContext {
  const desktopOpener = new MacOSDesktopOpener(options.streamingRunner);
  const pathResolver = options.pathResolver ?? resolveCommandPath;

  return {
    desktop: desktopOpener,
    service: new MacOSServiceManager({
      ...options,
      desktopOpener
    }),
    assertRuntimePrerequisitesInstalled: async () => {
      try {
        await pathResolver("sing-box");
      } catch {
        throw new FriendlyMessageError(MAC_PREREQUISITES_MESSAGE);
      }
    }
  };
}

export function buildLaunchDaemonPlist(singBoxPath: string, configPath: string): string {
  const escapedSingBoxPath = escapeXml(singBoxPath);
  const escapedConfigPath = escapeXml(configPath);
  const escapedLogPath = escapeXml(SERVICE_LOG_PATH);
  const escapedLabel = escapeXml(SERVICE_LABEL);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapedLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapedSingBoxPath}</string>
    <string>run</string>
    <string>--disable-color</string>
    <string>-c</string>
    <string>${escapedConfigPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapedLogPath}</string>
  <key>StandardErrorPath</key>
  <string>${escapedLogPath}</string>
</dict>
</plist>
`;
}

async function assertConfigExists(configPath: string): Promise<void> {
  try {
    await access(configPath);
  } catch {
    throw new FriendlyMessageError("Config not found. Use Select & Apply first.");
  }
}

async function ensureSudoSession(streamingRunner: StreamingRunner, isRoot: IsRoot): Promise<void> {
  if (isRoot()) {
    return;
  }

  await streamingRunner("sudo", ["-v"]);
}

async function runPrivilegedStreaming(
  command: string,
  args: string[],
  streamingRunner: StreamingRunner,
  isRoot: IsRoot
): Promise<void> {
  const invocation = buildPrivilegedInvocation(command, args, isRoot);
  await streamingRunner(invocation.command, invocation.args);
}

async function runPrivilegedCapture(
  command: string,
  args: string[],
  captureRunner: CaptureRunner,
  isRoot: IsRoot
): Promise<CommandResult> {
  const invocation = buildPrivilegedInvocation(command, args, isRoot);
  return captureRunner(invocation.command, invocation.args);
}

async function isServiceLoaded(captureRunner: CaptureRunner, isRoot: IsRoot, serviceLabel: string): Promise<boolean> {
  const result = await runPrivilegedCapture("launchctl", ["print", `system/${serviceLabel}`], captureRunner, isRoot);
  return result.code === 0;
}

async function clearServiceLogBeforeStart(
  streamingRunner: StreamingRunner,
  isRoot: IsRoot,
  logPath: string
): Promise<void> {
  await runPrivilegedStreaming("rm", ["-f", logPath], streamingRunner, isRoot);
}

function buildPrivilegedInvocation(
  command: string,
  args: string[],
  isRoot: IsRoot
): { args: string[]; command: string } {
  if (isRoot()) {
    return {
      command,
      args
    };
  }

  return {
    command: "sudo",
    args: [command, ...args]
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isProcessRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
