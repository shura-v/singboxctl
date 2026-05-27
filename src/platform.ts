import { FriendlyMessageError } from "./cli.js";
import type { AppContext } from "./app-context.js";
import { createMacOSAppContext } from "./platform/macos.js";

export type {
  AppContext,
  AppService,
  DesktopOpener,
  RuntimeDependencies,
  ServiceInstallResult,
  ServiceManagerInfo,
  ServiceStatus
} from "./app-context.js";

export function ensureSupportedPlatform(): void {
  if (process.platform !== "darwin") {
    throw new FriendlyMessageError("singboxctl currently supports only macOS.");
  }
}

export function createAppContext(): AppContext {
  ensureSupportedPlatform();
  return createMacOSAppContext();
}

export const ensureMacOS = ensureSupportedPlatform;
