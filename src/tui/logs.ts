import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { getGeneratedConfigPath } from "../store.js";
import { getLogLevel, setLogLevel, type LogLevel } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { runAndLogRuntimeRefresh } from "./shared.js";

type LogsAction = "back" | "clear" | "open" | "open-config-folder" | "set-level";

const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal", "panic"];

export async function runLogsMenu(context: AppContext): Promise<void> {
  await runChildMenuLoop<LogsAction>({
    select: async () => {
      const currentLogLevel = await getLogLevel();
      const serviceInfo = context.service.getInfo();

      return promptSelect<LogsAction>(
        [
          {
            value: "open",
            label: "Open",
            hint: `Open the service log in ${serviceInfo.logViewerName}`
          },
          {
            value: "clear",
            label: "Clear",
            hint: "Truncate the service log file"
          },
          {
            value: "open-config-folder",
            label: "Open config folder",
            hint: `Open the singboxctl config directory in ${serviceInfo.configDirectoryViewerName}`
          },
          {
            value: "set-level",
            label: "Set log level",
            hint: `Current: ${currentLogLevel}`
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Logs"
      );
    },
    onSelect: async (action) => {
      switch (action) {
        case "open":
          await runLogsOpen(context);
          return "continue";
        case "clear":
          await runLogsClear(context);
          return "continue";
        case "open-config-folder":
          await runOpenConfigFolder(context);
          return "continue";
        case "set-level":
          await runSetLogLevel(context);
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runLogsOpen(context: AppContext): Promise<void> {
  const serviceInfo = context.service.getInfo();
  await context.service.openLogs();
  log.success(`Opened ${serviceInfo.logPath} in ${serviceInfo.logViewerName}.`);
}

async function runLogsClear(context: AppContext): Promise<void> {
  const serviceInfo = context.service.getInfo();
  log.step(`Clearing service log. You may be asked for your ${serviceInfo.privilegePrompt}.`);
  await context.service.clearLogs();
  log.success(`Cleared ${serviceInfo.logPath}.`);
}

async function runOpenConfigFolder(context: AppContext): Promise<void> {
  const serviceInfo = context.service.getInfo();
  await context.service.openConfigDirectory();
  log.success(`Opened ${getGeneratedConfigPath()} parent folder in ${serviceInfo.configDirectoryViewerName}.`);
}

async function runSetLogLevel(context: AppContext): Promise<void> {
  const currentLogLevel = await getLogLevel();
  const nextLogLevel = await promptSelect<LogLevel>(
    LOG_LEVELS.map((level) => ({
      value: level,
      label: level,
      hint: level === currentLogLevel ? "current" : undefined
    })),
    "Set log level"
  );

  if (nextLogLevel === currentLogLevel) {
    throw new FriendlyMessageError(`Log level is already ${currentLogLevel}.`);
  }

  await runAndLogRuntimeRefresh({
    run: () => setLogLevel(nextLogLevel, context.service),
    success: () => `Set log level to ${nextLogLevel}.`
  });
}
