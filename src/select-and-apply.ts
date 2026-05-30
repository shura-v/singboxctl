import type { RuntimeDependencies } from "./app-context.js";
import {
  type ActiveSelectionRuntimeResult,
  applyActiveSelection,
  getConnection,
  getActiveConnectionName,
  getActiveProfileName,
  getNaiveUdpOverTcpEnabled,
  listConnections,
  listProfiles,
} from "./store.js";
import { isNaiveConnectionUri, type ConnectionGenerationOptions } from "./connection-uri.js";

export type ActiveSelection = {
  connectionName?: string;
  naiveUdpOverTcp: boolean;
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
  runtimeDependencies: RuntimeDependencies,
  options: ConnectionGenerationOptions = {}
): Promise<SelectAndApplyResult> {
  const result = await applyActiveSelection(connectionName, profileName, runtimeDependencies, options);

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
  const [connectionName, profileName, naiveUdpOverTcp] = await Promise.all([
    getActiveConnectionName(),
    getActiveProfileName(),
    getNaiveUdpOverTcpEnabled()
  ]);

  return {
    connectionName,
    profileName,
    naiveUdpOverTcp
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

export async function isNaiveConnectionSelection(connectionName: string): Promise<boolean> {
  const connection = await getConnection(connectionName);
  return isNaiveConnectionUri(connection.uri);
}
