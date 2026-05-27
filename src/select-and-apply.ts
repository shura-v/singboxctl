import type { RuntimeDependencies } from "./app-context.js";
import {
  type ActiveSelectionRuntimeResult,
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

export type SelectAndApplyResult = ActiveSelectionRuntimeResult & {
  activeSelectionComplete: true;
  configPath: string;
  connectionName: string;
  profileName: string;
};

export async function selectAndApplyByName(
  connectionName: string,
  profileName: string,
  runtimeDependencies: RuntimeDependencies
): Promise<SelectAndApplyResult> {
  const result = await applyActiveSelection(connectionName, profileName, runtimeDependencies);

  if (!result.activeSelectionComplete || !result.configPath) {
    throw new Error("Invariant violation: active selection runtime finalization did not produce config.json.");
  }

  return {
    activeSelectionComplete: true,
    configPath: result.configPath,
    disabledService: result.disabledService,
    removedGeneratedConfig: result.removedGeneratedConfig,
    restartedService: result.restartedService,
    stoppedService: result.stoppedService,
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
