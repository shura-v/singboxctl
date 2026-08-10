import { resolve } from "node:path";
import { FriendlyMessageError } from "./cli.js";
import { buildAndWriteGeneratedConfig } from "./sing-box-config.js";
import { getActiveConnectionName, getNaiveUdpOverTcpEnabled } from "./store.js";

export type GenerateConfigResult = {
  configPath: string;
  connectionName: string;
  profileName: string;
};

export async function generateConfigForProfile(
  profileName: string,
  outputPath?: string
): Promise<GenerateConfigResult> {
  const [connectionName, naiveUdpOverTcp] = await Promise.all([
    getActiveConnectionName(),
    getNaiveUdpOverTcpEnabled()
  ]);

  if (!connectionName) {
    throw new FriendlyMessageError("Active connection not found. Use Select & Apply first.");
  }

  const { configPath } = await buildAndWriteGeneratedConfig(
    connectionName,
    profileName,
    { naiveUdpOverTcp },
    outputPath === undefined ? undefined : resolve(outputPath)
  );

  return {
    configPath,
    connectionName,
    profileName
  };
}
