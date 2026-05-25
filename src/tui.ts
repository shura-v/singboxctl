import { outro } from "@clack/prompts";
import { promptSelect } from "./cli.js";
import { ensureDataDirectories, getActiveConnectionName, getActiveProfileName } from "./store.js";
import { runConnectFlow } from "./tui/connect.js";
import { runDisconnectFlow } from "./tui/disconnect.js";
import { runRootMenuLoop } from "./tui/menu-loop.js";
import { runConnectionsMenu } from "./tui/connections.js";
import { runProfilesMenu } from "./tui/profiles.js";
import { runRulesMenu } from "./tui/rules.js";

type MenuAction = "connect" | "connections" | "disconnect" | "exit" | "profiles" | "rules";

export async function runTui(): Promise<void> {
  await ensureDataDirectories();

  await runRootMenuLoop<MenuAction>({
    select: async () => {
      const activeConnectionName = await getActiveConnectionName();
      const activeProfileName = await getActiveProfileName();

      return promptSelect<MenuAction>(
        [
          {
            value: "connect",
            label: "Connect",
            hint:
              activeConnectionName && activeProfileName
                ? `${activeConnectionName} + ${activeProfileName}`
                : "Choose a connection and a profile"
          },
          {
            value: "disconnect",
            label: "Disconnect",
            hint:
              activeConnectionName || activeProfileName
                ? "Clear the current connection/profile selection"
                : "No active selection"
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
            value: "rules",
            label: "Rules",
            hint: "Manage sing-box match rules for profiles"
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
        case "disconnect":
          await runDisconnectFlow();
          return "continue";
        case "connections":
          await runConnectionsMenu();
          return "continue";
        case "profiles":
          await runProfilesMenu();
          return "continue";
        case "rules":
          await runRulesMenu();
          return "continue";
        case "exit":
          outro("Bye.");
          return "exit";
      }
    }
  });
}
