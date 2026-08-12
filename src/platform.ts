import { FriendlyMessageError } from "./cli.js";
import type { AppContext } from "./app-context.js";
import { createLinuxAppContext } from "./platform/linux.js";
import { createMacOSAppContext } from "./platform/macos.js";

export type {
  AppLogs,
  AppContext,
  AppRunner,
  AppService,
  DesktopOpener,
  ForegroundConnectResult,
  RuntimeDependencies,
  ServiceInstallResult,
  ServiceLogsInfo,
  ServiceManagerInfo,
  ServiceStatus
} from "./app-context.js";

export function ensureSupportedPlatform(): void {
  switch (process.platform) {
    case "darwin":
    case "linux":
      return;
    default:
      throw new FriendlyMessageError(`Platform not implemented yet: ${process.platform}.`);
  }
}

export function createAppContext(): AppContext {
  ensureSupportedPlatform();

  switch (process.platform) {
    case "darwin":
      return createMacOSAppContext();
    case "linux":
      return createLinuxAppContext();
    default:
      throw new FriendlyMessageError(`Platform not implemented yet: ${process.platform}.`);
  }
}

export function ensureMacOS(): void {
  if (process.platform !== "darwin") {
    throw new FriendlyMessageError(`Platform not implemented yet: ${process.platform}.`);
  }
}
