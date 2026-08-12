import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AppContext,
  AppLogs,
  AppRunner,
  AppService,
  DesktopOpener,
  ForegroundConnectResult,
  ServiceInstallResult,
  ServiceLogsInfo,
  ServiceManagerInfo,
  ServiceStatus
} from "../app-context.js";
import { FriendlyMessageError } from "../cli.js";
import { runCommandCapture, runCommandStreaming, resolveCommandPath, type CommandResult } from "../process.js";
import { getGeneratedConfigPath } from "../store.js";

type StreamingRunner = (command: string, args: string[]) => Promise<void>;
type CaptureRunner = (command: string, args: string[]) => Promise<CommandResult>;
type PathResolver = (command: string) => Promise<string>;
type IsRoot = () => boolean;
type FileExistsChecker = (filePath: string) => Promise<boolean>;

const LINUX_PREREQUISITES_MESSAGE = [
  "Linux prerequisites:",
  "- Install sing-box.",
  "- Ensure sing-box is available in PATH."
].join("\n");
const SYSTEMD_REQUIRED_MESSAGE = "Linux service management requires systemctl in PATH.";
const SUDO_REQUIRED_MESSAGE = "This operation requires sudo in PATH when running as a non-root user.";
const XDG_OPEN_REQUIRED_MESSAGE = "Opening files and directories requires xdg-open in PATH.";

const SERVICE_NAME = "singboxctl.service";
const SERVICE_UNIT_PATH = `/etc/systemd/system/${SERVICE_NAME}`;
const SERVICE_WANTS_LINK_PATH = `/etc/systemd/system/multi-user.target.wants/${SERVICE_NAME}`;
const SERVICE_LOG_PATH = "/var/log/singboxctl.log";

export type LinuxPlatformRuntimeOptions = {
  captureRunner?: CaptureRunner;
  fileExistsChecker?: FileExistsChecker;
  isRoot?: IsRoot;
  pathResolver?: PathResolver;
  streamingRunner?: StreamingRunner;
};

export class LinuxDesktopOpener implements DesktopOpener {
  constructor(
    private readonly options: Pick<LinuxPlatformRuntimeOptions, "pathResolver" | "streamingRunner"> = {}
  ) {}

  async openDirectory(directoryPath: string): Promise<void> {
    await this.openPath(directoryPath);
  }

  async openFile(filePath: string): Promise<void> {
    await this.openPath(filePath);
  }

  async openServiceLogs(logPath: string): Promise<void> {
    await this.openPath(logPath);
  }

  private async openPath(targetPath: string): Promise<void> {
    await resolveRequiredCommand("xdg-open", this.pathResolver(), XDG_OPEN_REQUIRED_MESSAGE);
    await this.streamingRunner()("xdg-open", [targetPath]);
  }

  private pathResolver(): PathResolver {
    return this.options.pathResolver ?? resolveCommandPath;
  }

  private streamingRunner(): StreamingRunner {
    return this.options.streamingRunner ?? runCommandStreaming;
  }
}

export class LinuxServiceManager implements AppService {
  private readonly desktopOpener: DesktopOpener;

  constructor(
    private readonly options: LinuxPlatformRuntimeOptions & {
      desktopOpener?: DesktopOpener;
    } = {}
  ) {
    this.desktopOpener = options.desktopOpener ?? new LinuxDesktopOpener(options);
  }

  getInfo(): ServiceManagerInfo {
    return {
      configDirectoryViewerName: "file manager",
      definitionLabel: "systemd unit",
      definitionPath: SERVICE_UNIT_PATH,
      displayName: "systemd service",
      label: SERVICE_NAME,
      privilegePrompt: "sudo password"
    };
  }

  async openConfigDirectory(): Promise<void> {
    await this.desktopOpener.openDirectory(dirname(getGeneratedConfigPath()));
  }

  async install(): Promise<ServiceInstallResult> {
    const service = this.getInfo();
    const configPath = getGeneratedConfigPath();
    await assertConfigExists(configPath);

    if (await this.fileExistsChecker()(service.definitionPath)) {
      throw new FriendlyMessageError("Service is already installed.");
    }

    await this.assertSystemdAvailable();
    const singBoxPath = await resolveRequiredCommand("sing-box", this.pathResolver(), LINUX_PREREQUISITES_MESSAGE);
    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    const unit = buildSystemdServiceUnit(singBoxPath, configPath);
    const tempDir = await mkdtemp(join(tmpdir(), "singboxctl-service-"));
    const tempUnitPath = join(tempDir, SERVICE_NAME);
    let copiedUnit = false;
    let enableAttempted = false;
    let startAttempted = false;

    try {
      await writeFile(tempUnitPath, unit, "utf8");
      await runPrivilegedStreaming(
        "install",
        ["-o", "root", "-g", "root", "-m", "644", tempUnitPath, service.definitionPath],
        this.streamingRunner(),
        this.isRoot()
      );
      copiedUnit = true;
      await runPrivilegedStreaming("systemctl", ["daemon-reload"], this.streamingRunner(), this.isRoot());
      enableAttempted = true;
      await runPrivilegedStreaming("systemctl", ["enable", service.label], this.streamingRunner(), this.isRoot());
      await clearServiceLogBeforeStart(this.streamingRunner(), this.isRoot(), SERVICE_LOG_PATH);
      startAttempted = true;
      await runPrivilegedStreaming("systemctl", ["start", service.label], this.streamingRunner(), this.isRoot());
    } catch (error) {
      if (copiedUnit) {
        if (startAttempted) {
          await ignoreCleanupError(() =>
            runPrivilegedStreaming("systemctl", ["stop", service.label], this.streamingRunner(), this.isRoot())
          );
        }

        if (enableAttempted) {
          await ignoreCleanupError(() =>
            runPrivilegedStreaming("systemctl", ["disable", service.label], this.streamingRunner(), this.isRoot())
          );
          await ignoreCleanupError(() =>
            runPrivilegedStreaming("rm", ["-f", SERVICE_WANTS_LINK_PATH], this.streamingRunner(), this.isRoot())
          );
        }

        await ignoreCleanupError(() =>
          runPrivilegedStreaming("rm", ["-f", service.definitionPath], this.streamingRunner(), this.isRoot())
        );
        await ignoreCleanupError(() =>
          runPrivilegedStreaming("systemctl", ["daemon-reload"], this.streamingRunner(), this.isRoot())
        );
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

    await this.assertSystemdAvailable();
    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    await runPrivilegedStreaming(
      "systemctl",
      ["disable", "--now", service.label],
      this.streamingRunner(),
      this.isRoot()
    );

    if (await isServiceActive(this.captureRunner(), service.label)) {
      throw new FriendlyMessageError("Service is still active after stop. Try removing it again.");
    }

    await runPrivilegedStreaming("rm", ["-f", service.definitionPath], this.streamingRunner(), this.isRoot());
    await runPrivilegedStreaming("systemctl", ["daemon-reload"], this.streamingRunner(), this.isRoot());
  }

  async getStatus(): Promise<ServiceStatus> {
    const service = this.getInfo();
    const installed = await this.fileExistsChecker()(service.definitionPath);
    let loaded = false;

    if (installed) {
      await this.assertSystemdAvailable();
      loaded = await isServiceActive(this.captureRunner(), service.label);
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

    await this.assertSystemdAvailable();
    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    await runPrivilegedStreaming("systemctl", ["enable", service.label], this.streamingRunner(), this.isRoot());
    await clearServiceLogBeforeStart(this.streamingRunner(), this.isRoot(), SERVICE_LOG_PATH);
    await runPrivilegedStreaming("systemctl", ["restart", service.label], this.streamingRunner(), this.isRoot());
    return true;
  }

  async disableIfInstalled(): Promise<boolean> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      return false;
    }

    await this.assertSystemdAvailable();
    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    await runPrivilegedStreaming("systemctl", ["disable", service.label], this.streamingRunner(), this.isRoot());
    return true;
  }

  async stopIfInstalled(): Promise<boolean> {
    const service = this.getInfo();

    if (!(await this.fileExistsChecker()(service.definitionPath))) {
      return false;
    }

    await this.assertSystemdAvailable();

    if (!(await isServiceActive(this.captureRunner(), service.label))) {
      return false;
    }

    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    await runPrivilegedStreaming("systemctl", ["stop", service.label], this.streamingRunner(), this.isRoot());

    if (await isServiceActive(this.captureRunner(), service.label)) {
      throw new FriendlyMessageError("Service is still active after stop. Try stopping it again.");
    }

    return true;
  }

  private captureRunner(): CaptureRunner {
    return this.options.captureRunner ?? runCommandCapture;
  }

  private async assertSystemdAvailable(): Promise<void> {
    await resolveRequiredCommand("systemctl", this.pathResolver(), SYSTEMD_REQUIRED_MESSAGE);
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

export class LinuxLogs implements AppLogs {
  private readonly desktopOpener: DesktopOpener;

  constructor(
    private readonly options: LinuxPlatformRuntimeOptions & {
      desktopOpener?: DesktopOpener;
    } = {}
  ) {
    this.desktopOpener = options.desktopOpener ?? new LinuxDesktopOpener(options);
  }

  getInfo(): ServiceLogsInfo {
    return {
      path: SERVICE_LOG_PATH,
      viewerName: "default application"
    };
  }

  async open(): Promise<void> {
    const { path } = this.getInfo();

    if (!(await this.fileExistsChecker()(path))) {
      throw new FriendlyMessageError(`Service log not found at ${path}.`);
    }

    await this.desktopOpener.openServiceLogs(path);
  }

  async clear(): Promise<void> {
    const { path } = this.getInfo();

    if (!(await this.fileExistsChecker()(path))) {
      return;
    }

    await ensureSudoSession(this.streamingRunner(), this.pathResolver(), this.isRoot());
    await runPrivilegedStreaming("truncate", ["-s", "0", path], this.streamingRunner(), this.isRoot());
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

export class LinuxRunner implements AppRunner {
  constructor(
    private readonly options: {
      isRoot?: IsRoot;
      pathResolver?: PathResolver;
      streamingRunner?: StreamingRunner;
    } = {}
  ) {}

  async connect(configPath: string): Promise<ForegroundConnectResult> {
    const singBoxPath = await resolveRequiredCommand("sing-box", this.pathResolver(), LINUX_PREREQUISITES_MESSAGE);
    await assertSudoAvailable(this.pathResolver(), this.isRoot());
    const invocation = buildLinuxSingBoxRunInvocation(configPath, singBoxPath, this.isRoot());

    await this.streamingRunner()(invocation.command, invocation.args);

    return {
      command: [invocation.command, ...invocation.args].join(" ")
    };
  }

  private pathResolver(): PathResolver {
    return this.options.pathResolver ?? resolveCommandPath;
  }

  private isRoot(): IsRoot {
    return this.options.isRoot ?? isProcessRoot;
  }

  private streamingRunner(): StreamingRunner {
    return this.options.streamingRunner ?? runCommandStreaming;
  }
}

export function createLinuxAppContext(options: LinuxPlatformRuntimeOptions = {}): AppContext {
  const desktopOpener = new LinuxDesktopOpener(options);
  const pathResolver = options.pathResolver ?? resolveCommandPath;

  return {
    desktop: desktopOpener,
    logs: new LinuxLogs({
      ...options,
      desktopOpener
    }),
    runner: new LinuxRunner({
      isRoot: options.isRoot,
      pathResolver: options.pathResolver,
      streamingRunner: options.streamingRunner
    }),
    service: new LinuxServiceManager({
      ...options,
      desktopOpener
    }),
    assertRuntimePrerequisitesInstalled: async () => {
      await resolveRequiredCommand("sing-box", pathResolver, LINUX_PREREQUISITES_MESSAGE);
    }
  };
}

export function buildSystemdServiceUnit(singBoxPath: string, configPath: string): string {
  const command = [singBoxPath, "run", "--disable-color", "-c", configPath]
    .map(quoteSystemdArgument)
    .join(" ");

  return `[Unit]
Description=singboxctl sing-box service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${command}
StandardOutput=append:${SERVICE_LOG_PATH}
StandardError=append:${SERVICE_LOG_PATH}

[Install]
WantedBy=multi-user.target
`;
}

export function buildLinuxSingBoxRunInvocation(
  configPath: string,
  singBoxPath: string,
  isRoot: IsRoot = isProcessRoot
): { args: string[]; command: string } {
  const args = ["run", "--disable-color", "-c", configPath];

  if (isRoot()) {
    return {
      command: singBoxPath,
      args
    };
  }

  return {
    command: "sudo",
    args: [singBoxPath, ...args]
  };
}

async function assertConfigExists(configPath: string): Promise<void> {
  try {
    await access(configPath);
  } catch {
    throw new FriendlyMessageError("Config not found. Use Select & Apply first.");
  }
}

async function ensureSudoSession(
  streamingRunner: StreamingRunner,
  pathResolver: PathResolver,
  isRoot: IsRoot
): Promise<void> {
  if (isRoot()) {
    return;
  }

  await resolveRequiredCommand("sudo", pathResolver, SUDO_REQUIRED_MESSAGE);
  await streamingRunner("sudo", ["-v"]);
}

async function assertSudoAvailable(pathResolver: PathResolver, isRoot: IsRoot): Promise<void> {
  if (!isRoot()) {
    await resolveRequiredCommand("sudo", pathResolver, SUDO_REQUIRED_MESSAGE);
  }
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

async function isServiceActive(captureRunner: CaptureRunner, serviceName: string): Promise<boolean> {
  const result = await captureRunner("systemctl", ["is-active", "--quiet", serviceName]);
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

function quoteSystemdArgument(argument: string): string {
  return `"${argument.replaceAll("%", "%%").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function resolveRequiredCommand(
  command: string,
  pathResolver: PathResolver,
  message: string
): Promise<string> {
  try {
    return await pathResolver(command);
  } catch {
    throw new FriendlyMessageError(message);
  }
}

async function ignoreCleanupError(cleanup: () => Promise<void>): Promise<void> {
  try {
    await cleanup();
  } catch {
    // Preserve the install failure that triggered rollback.
  }
}
