import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError } from "../cli.js";
import { getActiveSelection } from "../select-and-apply.js";
import { finalizeActiveSelectionRuntime } from "../store.js";
import { runAndLogRuntimeRefresh } from "./shared.js";

export async function runRebuildConfigFlow(context: AppContext): Promise<void> {
  const selection = await getActiveSelection();

  if (!selection.connectionName || !selection.profileName) {
    throw new FriendlyMessageError("Choose an active connection and profile before rebuilding config.json.");
  }

  const result = await runAndLogRuntimeRefresh({
    run: () => finalizeActiveSelectionRuntime(context.service)
  });

  if (!result.activeSelectionComplete) {
    throw new FriendlyMessageError("Choose an active connection and profile before rebuilding config.json.");
  }

  log.success(`Rebuilt config.json for "${selection.connectionName}" + "${selection.profileName}".`);
}
