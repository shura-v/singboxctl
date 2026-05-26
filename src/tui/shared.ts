import { log } from "@clack/prompts";
import type { ActiveSelectionRuntimeResult } from "../store.js";

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function requiredText(message: string) {
  return (value: string | undefined) => {
    if (!value || value.trim().length === 0) {
      return message;
    }

    return undefined;
  };
}

export function readConnectionNameDefault(uri: string): string {
  const hashIndex = uri.indexOf("#");

  if (hashIndex < 0 || hashIndex === uri.length - 1) {
    return "";
  }

  const rawFragment = uri.slice(hashIndex + 1).trim();

  try {
    return decodeURIComponent(rawFragment).trim();
  } catch {
    return rawFragment;
  }
}

export function logRuntimeRefresh(result: ActiveSelectionRuntimeResult): void {
  if (!result.activeSelectionComplete) {
    log.info("No active selection to rebuild.");
    return;
  }

  log.info("Rebuilt config.json from the active selection.");

  if (result.restartedService) {
    log.info("Background service is enabled. Restarted it to apply the new config.");
    return;
  }

  log.info("Background service is not enabled. Not restarting it.");
}

export async function runAndLogRuntimeRefresh<T extends ActiveSelectionRuntimeResult>(options: {
  run: () => Promise<T>;
  success?: (result: T) => string;
}): Promise<T> {
  const result = await options.run();

  if (options.success) {
    log.success(options.success(result));
  }

  logRuntimeRefresh(result);
  return result;
}
