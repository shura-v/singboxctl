import type { AppContext, ServiceStatus } from "./app-context.js";
import { FriendlyMessageError } from "./cli.js";
import { resolveCommandPath, runCommandStreaming } from "./process.js";
import { getGeneratedConfigPath } from "./store.js";
import { access } from "node:fs/promises";

type StreamingRunner = (command: string, args: string[]) => Promise<void>;
type PathResolver = (command: string) => Promise<string>;
type ServiceStatusGetter = () => Promise<ServiceStatus>;

export type ConnectResult = {
  command: string;
  configPath: string;
};

export async function connect(
  context: Pick<AppContext, "service">,
  streamingRunner: StreamingRunner = runCommandStreaming,
  pathResolver: PathResolver = resolveCommandPath,
  serviceStatusGetter: ServiceStatusGetter = () => context.service.getStatus()
): Promise<ConnectResult> {
  const configPath = getGeneratedConfigPath();
  await assertConfigExists(configPath);
  await assertServiceNotLoaded(serviceStatusGetter);
  const singBoxPath = await pathResolver("sing-box");
  const invocation = buildSingBoxRunInvocation(configPath, singBoxPath);

  await streamingRunner(invocation.command, invocation.args);

  return {
    command: [invocation.command, ...invocation.args].join(" "),
    configPath
  };
}

export function buildSingBoxRunInvocation(configPath: string, singBoxPath: string): { args: string[]; command: string } {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return {
      command: singBoxPath,
      args: ["run", "--disable-color", "-c", configPath]
    };
  }

  return {
    command: "sudo",
    args: [singBoxPath, "run", "--disable-color", "-c", configPath]
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
