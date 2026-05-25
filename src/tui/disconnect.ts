import { log } from "@clack/prompts";
import { clearActiveSelection, getActiveConnectionName, getActiveProfileName } from "../store.js";

export async function runDisconnectFlow(): Promise<void> {
  const activeConnectionName = await getActiveConnectionName();
  const activeProfileName = await getActiveProfileName();

  if (!activeConnectionName && !activeProfileName) {
    log.step("No active connection/profile selection.");
    return;
  }

  await clearActiveSelection();
  log.success("Cleared active connection/profile selection.");
}
