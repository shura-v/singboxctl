import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { clearServiceLogs, getServiceLogPath, openServiceLogs } from "../service.js";
import { getLogLevel, setLogLevel, type LogLevel } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type LogsAction = "back" | "clear" | "open" | "set-level";

const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal", "panic"];

export async function runLogsMenu(): Promise<void> {
  await runChildMenuLoop<LogsAction>({
    select: async () => {
      const currentLogLevel = await getLogLevel();

      return promptSelect<LogsAction>(
        [
          {
            value: "open",
            label: "Open",
            hint: "Open the service log in macOS Console"
          },
          {
            value: "clear",
            label: "Clear",
            hint: "Truncate the service log file"
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
          await runLogsOpen();
          return "continue";
        case "clear":
          await runLogsClear();
          return "continue";
        case "set-level":
          await runSetLogLevel();
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runLogsOpen(): Promise<void> {
  await openServiceLogs();
  log.success(`Opened ${getServiceLogPath()} in Console.`);
}

async function runLogsClear(): Promise<void> {
  log.step("Clearing service log. You may be asked for your macOS password.");
  await clearServiceLogs();
  log.success(`Cleared ${getServiceLogPath()}.`);
}

async function runSetLogLevel(): Promise<void> {
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

  const rebuilt = await setLogLevel(nextLogLevel);
  log.success(`Set log level to ${nextLogLevel}.`);

  if (rebuilt) {
    log.info("Rebuilt config.json from the active selection.");
  } else {
    log.info("No active selection to rebuild.");
  }
}
