import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import {
  getActiveConnectionName,
  getActiveProfileName,
  listConnections,
  listProfiles,
  setActiveSelection
} from "../store.js";

export async function runConnectFlow(): Promise<void> {
  const connections = await listConnections();

  if (connections.length === 0) {
    throw new FriendlyMessageError("Add a connection before using Connect.");
  }

  const profiles = await listProfiles();

  if (profiles.length === 0) {
    throw new FriendlyMessageError("Add a profile before using Connect.");
  }

  const currentConnectionName = await getActiveConnectionName();
  const currentProfileName = await getActiveProfileName();

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
      hint: profile.name === currentProfileName ? "current" : undefined
    })),
    "Choose a profile"
  );

  await setActiveSelection(connectionName, profileName);
  log.success(`Selected connection "${connectionName}" with profile "${profileName}".`);
}
