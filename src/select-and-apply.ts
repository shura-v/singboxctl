import {
  applyActiveSelection,
  getActiveConnectionName,
  getActiveProfileName,
  listConnections,
  listProfiles,
} from "./store.js";

export type ActiveSelection = {
  connectionName?: string;
  profileName?: string;
};

export async function selectAndApplyByName(
  connectionName: string,
  profileName: string
): Promise<{
  configPath: string;
  connectionName: string;
  profileName: string;
}> {
  const result = await applyActiveSelection(connectionName, profileName);

  if (!result.activeSelectionComplete || !result.configPath) {
    throw new Error("Invariant violation: active selection runtime finalization did not produce config.json.");
  }

  return {
    configPath: result.configPath,
    connectionName,
    profileName
  };
}

export async function getActiveSelection(): Promise<ActiveSelection> {
  const [connectionName, profileName] = await Promise.all([
    getActiveConnectionName(),
    getActiveProfileName()
  ]);

  return {
    connectionName,
    profileName
  };
}

export async function listSelectableOptions(): Promise<{
  connections: Array<{ name: string }>;
  profiles: Array<{ name: string }>;
}> {
  const [connections, profiles] = await Promise.all([listConnections(), listProfiles()]);

  return {
    connections: connections.map((connection) => ({ name: connection.name })),
    profiles: profiles.map((profile) => ({ name: profile.name }))
  };
}
