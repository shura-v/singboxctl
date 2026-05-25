import { log } from "@clack/prompts";
import { FriendlyMessageError } from "../cli.js";
import { getActiveSelection } from "../select-and-apply.js";
import { finalizeActiveSelectionRuntime } from "../store.js";

export async function runRebuildConfigFlow(): Promise<void> {
  const selection = await getActiveSelection();

  if (!selection.connectionName || !selection.profileName) {
    throw new FriendlyMessageError("Choose an active connection and profile before rebuilding config.json.");
  }

  const result = await finalizeActiveSelectionRuntime();

  if (!result.activeSelectionComplete) {
    throw new FriendlyMessageError("Choose an active connection and profile before rebuilding config.json.");
  }

  log.success(`Rebuilt config.json for "${selection.connectionName}" + "${selection.profileName}".`);
}
