import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { getActiveSelection, listSelectableOptions, selectAndApplyByName } from "../select-and-apply.js";
import { FULL_TUNNEL_PROFILE_NAME } from "../store.js";
import { runAndLogRuntimeRefresh } from "./shared.js";

export async function runSelectAndApplyFlow(context: AppContext): Promise<void> {
  const { connections, profiles } = await listSelectableOptions();

  if (connections.length === 0) {
    throw new FriendlyMessageError("Add a connection before using Select & Apply.");
  }

  if (profiles.length === 0) {
    throw new FriendlyMessageError("Add a profile before using Select & Apply.");
  }

  const currentSelection = await getActiveSelection();
  const currentConnectionName = currentSelection.connectionName;
  const currentProfileName = currentSelection.profileName;

  const connectionName = await promptSelect(
    connections.map((connection) => ({
      value: connection.name,
      label: connection.name,
      hint: connection.name === currentConnectionName ? "current" : undefined
    })),
    "Choose a connection"
  );

  const profileName = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint:
        profile.name === currentProfileName
          ? "current"
          : profile.name === FULL_TUNNEL_PROFILE_NAME
            ? "built-in full tunnel"
            : undefined
    })),
    "Choose a profile"
  );

  await runAndLogRuntimeRefresh({
    run: () => selectAndApplyByName(connectionName, profileName, context.service),
    success: (selection) =>
      `Applied connection "${selection.connectionName}" with profile "${selection.profileName}" and wrote ${selection.configPath}.`
  });
}
