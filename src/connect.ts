import type { AppContext, ServiceStatus } from "./app-context.js";
import { FriendlyMessageError } from "./cli.js";
import { getGeneratedConfigPath } from "./store.js";
import { access } from "node:fs/promises";

type ServiceStatusGetter = () => Promise<ServiceStatus>;

export type ConnectResult = {
  command: string;
  configPath: string;
};

export async function connect(
  context: Pick<AppContext, "runner" | "service">,
  serviceStatusGetter: ServiceStatusGetter = () => context.service.getStatus()
): Promise<ConnectResult> {
  const configPath = getGeneratedConfigPath();
  await assertConfigExists(configPath);
  await assertServiceNotLoaded(serviceStatusGetter);
  const result = await context.runner.connect(configPath);

  return {
    command: result.command,
    configPath
  };
}

async function assertConfigExists(configPath: string): Promise<void> {
  try {
    await access(configPath);
  } catch {
    throw new FriendlyMessageError("Config not found. Use Select & Apply first.");
  }
}

async function assertServiceNotLoaded(serviceStatusGetter: ServiceStatusGetter): Promise<void> {
  const status = await serviceStatusGetter();

  if (status.loaded) {
    throw new FriendlyMessageError(
      `${status.service.displayName} "${status.service.label}" is already running. Stop or remove it before using foreground connect.`
    );
  }
}
