import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { getServiceStatus, installService, uninstallService } from "../service.js";
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
            label: "Install",
            hint: "Install a launchd service and start it at boot"
          },
          {
            value: "remove",
            label: "Remove",
            hint: "Unload and remove the launchd service"
          },
          {
            value: "status",
            label: "Status",
            hint: "Show whether the launchd service is installed and loaded"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Service"
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
  log.success(`Installed service "${result.label}" using ${result.configPath}.`);
}

async function runServiceRemove(): Promise<void> {
  log.step("Removing launchd service. You may be asked for your macOS password.");
  await uninstallService();
  await setServiceIntent(false);
  log.success("Removed launchd service.");
}

async function runServiceStatus(): Promise<void> {
  const status = await getServiceStatus();

  if (!status.installed) {
    throw new FriendlyMessageError("Service is not installed.");
  }

  log.info(`Label: ${status.label}`);
  log.info(`Plist: ${status.plistPath}`);
  log.info(`Config: ${status.configPath}`);
  log.info(`Loaded: ${status.loaded ? "yes" : "no"}`);
}
