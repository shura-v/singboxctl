import { FriendlyMessageError } from "./cli.js";
import type { AppContext } from "./app-context.js";
import { createMacOSAppContext } from "./platform/macos.js";

export type {
  AppContext,
  AppRunner,
  AppService,
  DesktopOpener,
  ForegroundConnectResult,
  RuntimeDependencies,
  ServiceInstallResult,
  ServiceManagerInfo,
  ServiceStatus
} from "./app-context.js";

export function ensureSupportedPlatform(): void {
  switch (process.platform) {
    case "darwin":
      return;
    default:
      throw new FriendlyMessageError(`Platform not implemented yet: ${process.platform}.`);
  }
}

export function createAppContext(): AppContext {
  switch (process.platform) {
    case "darwin":
      return createMacOSAppContext();
    default:
      throw new FriendlyMessageError(`Platform not implemented yet: ${process.platform}.`);
  }
}

export const ensureMacOS = ensureSupportedPlatform;
