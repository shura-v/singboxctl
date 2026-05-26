import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FriendlyMessageError } from "./cli.js";
import { runCommandCapture, runCommandStreaming, resolveCommandPath, type CommandResult } from "./process.js";
import { getGeneratedConfigPath } from "./store.js";

type StreamingRunner = (command: string, args: string[]) => Promise<void>;
type CaptureRunner = (command: string, args: string[]) => Promise<CommandResult>;
type PathResolver = (command: string) => Promise<string>;
type IsRoot = () => boolean;
type FileExistsChecker = (filePath: string) => Promise<boolean>;

const SERVICE_LABEL = "io.shura.singboxctl";
const SERVICE_PLIST_PATH = `/Library/LaunchDaemons/${SERVICE_LABEL}.plist`;
const SERVICE_LOG_PATH = "/var/log/singboxctl.log";

export type ServiceStatus = {
  configPath: string;
  installed: boolean;
  label: string;
  loaded: boolean;
  plistPath: string;
};

export type ServiceInstallResult = {
  configPath: string;
  label: string;
  plistPath: string;
};

export function getServiceLabel(): string {
  return SERVICE_LABEL;
}

export function getServiceLogPath(): string {
  return SERVICE_LOG_PATH;
}

export function getServicePlistPath(): string {
  return SERVICE_PLIST_PATH;
}

export async function openServiceLogs(
  streamingRunner: StreamingRunner = runCommandStreaming,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<void> {
  if (!(await fileExistsChecker(SERVICE_LOG_PATH))) {
    throw new FriendlyMessageError(`Service log not found at ${SERVICE_LOG_PATH}.`);
  }

  await streamingRunner("open", ["-a", "Console", SERVICE_LOG_PATH]);
}

export async function clearServiceLogs(
  streamingRunner: StreamingRunner = runCommandStreaming,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<void> {
  if (!(await fileExistsChecker(SERVICE_LOG_PATH))) {
    return;
  }

  await ensureSudoSession(streamingRunner, isRoot);
  await runPrivilegedStreaming("truncate", ["-s", "0", SERVICE_LOG_PATH], streamingRunner, isRoot);
}

export async function installService(
  streamingRunner: StreamingRunner = runCommandStreaming,
  pathResolver: PathResolver = resolveCommandPath,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<ServiceInstallResult> {
  const configPath = getGeneratedConfigPath();
  await assertConfigExists(configPath);

  if (await fileExistsChecker(SERVICE_PLIST_PATH)) {
    throw new FriendlyMessageError("Service is already installed.");
  }

  const singBoxPath = await pathResolver("sing-box");
  const plist = buildLaunchDaemonPlist(singBoxPath, configPath);
  const tempDir = await mkdtemp(join(tmpdir(), "singboxctl-service-"));
  const tempPlistPath = join(tempDir, `${SERVICE_LABEL}.plist`);
  let copiedPlist = false;

  try {
    await writeFile(tempPlistPath, plist, "utf8");
    await ensureSudoSession(streamingRunner, isRoot);
    await runPrivilegedStreaming("cp", [tempPlistPath, SERVICE_PLIST_PATH], streamingRunner, isRoot);
    copiedPlist = true;
    await runPrivilegedStreaming("chown", ["root:wheel", SERVICE_PLIST_PATH], streamingRunner, isRoot);
    await runPrivilegedStreaming("chmod", ["644", SERVICE_PLIST_PATH], streamingRunner, isRoot);
    await runPrivilegedStreaming("launchctl", ["enable", `system/${SERVICE_LABEL}`], streamingRunner, isRoot);
    await clearServiceLogBeforeStart(streamingRunner, isRoot);
    await runPrivilegedStreaming(
      "launchctl",
      ["bootstrap", "system", SERVICE_PLIST_PATH],
      streamingRunner,
      isRoot
    );
  } catch (error) {
    if (copiedPlist) {
      await runPrivilegedStreaming("rm", ["-f", SERVICE_PLIST_PATH], streamingRunner, isRoot);
    }

    throw error;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  return {
    configPath,
    label: SERVICE_LABEL,
    plistPath: SERVICE_PLIST_PATH
  };
}

export async function uninstallService(
  streamingRunner: StreamingRunner = runCommandStreaming,
  captureRunner: CaptureRunner = runCommandCapture,
  isRoot: IsRoot = isProcessRoot
): Promise<void> {
  if (!(await fileExists(SERVICE_PLIST_PATH))) {
    throw new FriendlyMessageError("Service is not installed.");
  }

  await ensureSudoSession(streamingRunner, isRoot);
  await runPrivilegedCapture("launchctl", ["bootout", `system/${SERVICE_LABEL}`], captureRunner, isRoot);
  const loadedAfterBootout = await isServiceLoaded(captureRunner, isRoot);

  if (loadedAfterBootout) {
    throw new FriendlyMessageError("Service is still loaded after bootout. Try removing it again.");
  }

  await runPrivilegedStreaming("rm", ["-f", SERVICE_PLIST_PATH], streamingRunner, isRoot);
}

export async function getServiceStatus(
  streamingRunner: StreamingRunner = runCommandStreaming,
  captureRunner: CaptureRunner = runCommandCapture,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<ServiceStatus> {
  const installed = await fileExistsChecker(SERVICE_PLIST_PATH);
  let loaded = false;

  if (installed) {
    await ensureSudoSession(streamingRunner, isRoot);
    const result = await runPrivilegedCapture(
      "launchctl",
      ["print", `system/${SERVICE_LABEL}`],
      captureRunner,
      isRoot
    );
    loaded = result.code === 0;
  }

  return {
    configPath: getGeneratedConfigPath(),
    installed,
    label: SERVICE_LABEL,
    loaded,
    plistPath: SERVICE_PLIST_PATH
  };
}

export async function restartServiceIfInstalled(
  streamingRunner: StreamingRunner = runCommandStreaming,
  captureRunner: CaptureRunner = runCommandCapture,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<boolean> {
  if (!(await fileExistsChecker(SERVICE_PLIST_PATH))) {
    return false;
  }

  await ensureSudoSession(streamingRunner, isRoot);
  await runPrivilegedStreaming("launchctl", ["enable", `system/${SERVICE_LABEL}`], streamingRunner, isRoot);

  if (await isServiceLoaded(captureRunner, isRoot)) {
    await clearServiceLogBeforeStart(streamingRunner, isRoot);
    await runPrivilegedStreaming("launchctl", ["kickstart", "-k", `system/${SERVICE_LABEL}`], streamingRunner, isRoot);
    return true;
  }

  await clearServiceLogBeforeStart(streamingRunner, isRoot);
  await runPrivilegedStreaming("launchctl", ["bootstrap", "system", SERVICE_PLIST_PATH], streamingRunner, isRoot);
  return true;
}

export async function disableServiceIfInstalled(
  streamingRunner: StreamingRunner = runCommandStreaming,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<boolean> {
  if (!(await fileExistsChecker(SERVICE_PLIST_PATH))) {
    return false;
  }

  await ensureSudoSession(streamingRunner, isRoot);
  await runPrivilegedStreaming("launchctl", ["disable", `system/${SERVICE_LABEL}`], streamingRunner, isRoot);
  return true;
}

export async function stopServiceIfInstalled(
  streamingRunner: StreamingRunner = runCommandStreaming,
  captureRunner: CaptureRunner = runCommandCapture,
  isRoot: IsRoot = isProcessRoot,
  fileExistsChecker: FileExistsChecker = fileExists
): Promise<boolean> {
  if (!(await fileExistsChecker(SERVICE_PLIST_PATH))) {
    return false;
  }

  await ensureSudoSession(streamingRunner, isRoot);

  if (!(await isServiceLoaded(captureRunner, isRoot))) {
    return false;
  }

  await runPrivilegedCapture("launchctl", ["bootout", `system/${SERVICE_LABEL}`], captureRunner, isRoot);
  const loadedAfterBootout = await isServiceLoaded(captureRunner, isRoot);

  if (loadedAfterBootout) {
    throw new FriendlyMessageError("Service is still loaded after bootout. Try stopping it again.");
  }

  return true;
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

async function isServiceLoaded(captureRunner: CaptureRunner, isRoot: IsRoot): Promise<boolean> {
  const result = await runPrivilegedCapture(
    "launchctl",
    ["print", `system/${SERVICE_LABEL}`],
    captureRunner,
    isRoot
  );
  return result.code === 0;
}

async function clearServiceLogBeforeStart(streamingRunner: StreamingRunner, isRoot: IsRoot): Promise<void> {
  await runPrivilegedStreaming("rm", ["-f", SERVICE_LOG_PATH], streamingRunner, isRoot);
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
