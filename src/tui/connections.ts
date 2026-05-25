import { cancel, log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect, promptText } from "../cli.js";
import { runCommandCapture } from "../process.js";
import { addConnection, listConnections, removeConnection } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { readConnectionNameDefault, requiredText, truncate } from "./shared.js";

type ConnectionsAction = "add" | "back" | "remove";

export async function runConnectionsMenu(): Promise<void> {
  await runChildMenuLoop<ConnectionsAction>({
    select: async () => {
      const connections = await listConnections();

      return promptSelect<ConnectionsAction>(
        [
          {
            value: "add",
            label: "Add",
            hint: "Save a new Xray-compatible URI"
          },
          {
            value: "remove",
            label: "Remove",
            hint: connections.length > 0 ? `${connections.length} saved` : "No saved connections yet"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Connections"
      );
    },
    onSelect: async (action) => {
      switch (action) {
        case "add":
          await runConnectionsAdd();
          return "continue";
        case "remove":
          await runConnectionsRemove();
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runConnectionsAdd(): Promise<void> {
  const uri = await promptText({
    message: "Connection URI",
    placeholder: "vless://...",
    validate: requiredText("Connection URI is required.")
  });
  await validateConnectionUri(uri);

  const name = await promptText({
    message: "Connection name",
    placeholder: "work-vless",
    initialValue: readConnectionNameDefault(uri),
    validate: requiredText("Connection name is required.")
  });

  const connection = await addConnection(name, uri);
  log.success(`Saved connection "${connection.name}".`);
}

async function validateConnectionUri(uri: string): Promise<void> {
  const result = await runCommandCapture("vpnparser", ["s", uri]);

  if (result.code === 0) {
    return;
  }

  throw new FriendlyMessageError(formatVpnparserFailure(result.stderr, result.stdout));
}

export function formatVpnparserFailure(stderr: string, stdout: string): string {
  const stderrText = stderr.trim();
  const stdoutText = stdout.trim();
  const combinedText = [stderrText, stdoutText].filter((value) => value.length > 0).join("\n");

  if (combinedText.includes("panic:")) {
    return "vpnparser crashed while parsing this URI. Check that it is a valid Xray-compatible URI.";
  }

  return stderrText || stdoutText || "vpnparser failed to parse the URI.";
}

async function runConnectionsRemove(): Promise<void> {
  const connections = await listConnections();

  if (connections.length === 0) {
    throw new FriendlyMessageError("No saved connections to remove.");
  }

  const name = await promptSelect(
    connections.map((connection) => ({
      value: connection.name,
      label: connection.name,
      hint: truncate(connection.uri, 80)
    })),
    "Choose a connection to remove"
  );

  await removeConnection(name);
  log.success(`Removed connection "${name}".`);
}
