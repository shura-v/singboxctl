import { outro } from "@clack/prompts";
import { promptSelect } from "./cli.js";
import { ensureDataDirectories, getActiveConnectionName, getActiveProfileName, getIpv6Enabled } from "./store.js";
import { runConnectFlow } from "./tui/connect.js";
import { runIpv6Menu } from "./tui/ipv6.js";
import { runRootMenuLoop } from "./tui/menu-loop.js";
import { runConnectionsMenu } from "./tui/connections.js";
import { runLogsMenu } from "./tui/logs.js";
import { runProfilesMenu } from "./tui/profiles.js";
import { runRulesMenu } from "./tui/rules.js";
import { runSelectAndApplyFlow } from "./tui/select-and-apply.js";
import { runServiceMenu } from "./tui/service.js";

type MenuAction =
  | "connect"
  | "connections"
  | "exit"
  | "ipv6"
  | "logs"
  | "profiles"
  | "rule-sets"
  | "section-run"
  | "section-manage"
  | "section-system"
  | "select-and-apply"
  | "service";

export async function runTui(): Promise<void> {
  await ensureDataDirectories();

  await runRootMenuLoop<MenuAction>({
    select: async () => {
      const activeConnectionName = await getActiveConnectionName();
      const activeProfileName = await getActiveProfileName();
      const ipv6Enabled = await getIpv6Enabled();

      return promptSelect<MenuAction>(
        [
          {
            value: "section-run",
            label: "———— Runtime ————",
            disabled: true
          },
          {
            value: "service",
            label: "Auto-start in background",
            hint: "Run sing-box in the background now and on future startups"
          },
          {
            value: "connect",
            label: "Connect in terminal",
            hint: "Debug mode: run in foreground and show logs in this terminal"
          },
          {
            value: "section-manage",
            label: "———— Manage ————",
            disabled: true
          },
          {
            value: "select-and-apply",
            label: "Select connection and profile",
            hint:
              activeConnectionName && activeProfileName
                ? `${activeConnectionName} + ${activeProfileName}`
                : "Choose a connection and a profile"
          },
          {
            value: "connections",
            label: "Connections",
            hint: "Manage saved Xray-compatible URIs"
          },
          {
            value: "profiles",
            label: "Profiles",
            hint: "Manage routing profiles"
          },
          {
            value: "ipv6",
            label: "IPv6",
            hint: ipv6Enabled ? "Enabled for TUN inbounds" : "Disabled for TUN inbounds"
          },
          {
            value: "rule-sets",
            label: "Rule Sets",
            hint: "Manage named sing-box rule groups"
          },
          {
            value: "section-system",
            label: "———— System ————",
            disabled: true
          },
          {
            value: "logs",
            label: "Logs",
            hint: "Open or clear the launchd service log"
          },
          {
            value: "exit",
            label: "Exit"
          }
        ],
        "Choose an action"
      );
    },
    onSelect: async (action) => {
      switch (action) {
        case "connect":
          await runConnectFlow();
          return "continue";
        case "select-and-apply":
          await runSelectAndApplyFlow();
          return "continue";
        case "connections":
          await runConnectionsMenu();
          return "continue";
        case "profiles":
          await runProfilesMenu();
          return "continue";
        case "ipv6":
          await runIpv6Menu();
          return "continue";
        case "rule-sets":
          await runRulesMenu();
          return "continue";
        case "section-run":
        case "section-manage":
        case "section-system":
          return "continue";
        case "logs":
          await runLogsMenu();
          return "continue";
        case "service":
          await runServiceMenu();
          return "continue";
        case "exit":
          outro("Bye.");
          return "exit";
      }
    }
  });
}
