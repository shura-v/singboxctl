import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { setServiceIntent } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type ServiceAction = "back" | "install" | "remove" | "status";

export async function runServiceMenu(context: AppContext): Promise<void> {
  await runChildMenuLoop<ServiceAction>({
    select: () =>
      promptSelect<ServiceAction>(
        [
          {
            value: "install",
            label: "Enable",
            hint: "Run sing-box in the background now and on future startups"
          },
          {
            value: "remove",
            label: "Disable",
            hint: "Stop background auto-start and unload the running service"
          },
          {
            value: "status",
            label: "Status",
            hint: "Show whether auto-start is installed and currently loaded"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Auto-start in background"
      ),
    onSelect: async (action) => {
      switch (action) {
        case "install":
          await runServiceInstall(context);
          return "continue";
        case "remove":
          await runServiceRemove(context);
          return "continue";
        case "status":
          await runServiceStatus(context);
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runServiceInstall(context: AppContext): Promise<void> {
  const serviceInfo = context.service.getInfo();
  log.step(`Installing ${serviceInfo.displayName}. You may be asked for your ${serviceInfo.privilegePrompt}.`);
  const result = await context.service.install();
  await setServiceIntent(true);
  log.success(`Enabled auto-start using ${result.configPath}.`);
}

async function runServiceRemove(context: AppContext): Promise<void> {
  const serviceInfo = context.service.getInfo();
  log.step(`Removing ${serviceInfo.displayName}. You may be asked for your ${serviceInfo.privilegePrompt}.`);
  await context.service.uninstall();
  await setServiceIntent(false);
  log.success("Disabled auto-start.");
}

async function runServiceStatus(context: AppContext): Promise<void> {
  const status = await context.service.getStatus();
  const logsInfo = context.logs.getInfo();

  if (!status.installed) {
    throw new FriendlyMessageError("Auto-start is not enabled.");
  }

  log.info(`Label: ${status.service.label}`);
  log.info(`${status.service.definitionLabel}: ${status.service.definitionPath}`);
  log.info(`Config: ${status.configPath}`);
  log.info(`Loaded: ${status.loaded ? "yes" : "no"}`);
  log.info(`Log: ${logsInfo.path}`);
}
