import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { getServiceLogPath, getServiceStatus, installService, uninstallService } from "../service.js";
import { setServiceIntent } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type ServiceAction = "back" | "install" | "remove" | "status";

export async function runServiceMenu(): Promise<void> {
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
          await runServiceInstall();
          return "continue";
        case "remove":
          await runServiceRemove();
          return "continue";
        case "status":
          await runServiceStatus();
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runServiceInstall(): Promise<void> {
  log.step("Installing launchd service. You may be asked for your macOS password.");
  const result = await installService();
  await setServiceIntent(true);
  log.success(`Enabled auto-start using ${result.configPath}.`);
}

async function runServiceRemove(): Promise<void> {
  log.step("Removing launchd service. You may be asked for your macOS password.");
  await uninstallService();
  await setServiceIntent(false);
  log.success("Disabled auto-start.");
}

async function runServiceStatus(): Promise<void> {
  const status = await getServiceStatus();

  if (!status.installed) {
    throw new FriendlyMessageError("Auto-start is not enabled.");
  }

  log.info(`Label: ${status.label}`);
  log.info(`Plist: ${status.plistPath}`);
  log.info(`Config: ${status.configPath}`);
  log.info(`Loaded: ${status.loaded ? "yes" : "no"}`);
  log.info(`Log: ${getServiceLogPath()}`);
}
