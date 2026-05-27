import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect, promptText } from "../cli.js";
import { validateConnectionUri } from "../connection-uri.js";
import { addConnection, listConnections, removeConnection, updateConnection } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { readConnectionNameDefault, requiredText, truncate } from "./shared.js";

type ConnectionsAction = "add" | "back" | "edit" | "remove";

export async function runConnectionsMenu(context: AppContext): Promise<void> {
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
            value: "edit",
            label: "Edit",
            hint: connections.length > 0 ? "Update a saved connection name and URI" : "No saved connections yet"
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
          await runConnectionsRemove(context);
          return "continue";
        case "edit":
          await runConnectionsEdit(context);
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
    placeholder: "vless://... or hysteria2://...",
    validate: requiredText("Connection URI is required.")
  });
  const warnings = await validateConnectionUri(uri);

  for (const warning of warnings) {
    log.warn(warning);
  }

  const name = await promptText({
    message: "Connection name",
    placeholder: "work-vless",
    initialValue: readConnectionNameDefault(uri),
    validate: requiredText("Connection name is required.")
  });

  const connection = await addConnection(name, uri);
  log.success(`Saved connection "${connection.name}".`);
}

async function runConnectionsEdit(context: AppContext): Promise<void> {
  const connections = await listConnections();

  if (connections.length === 0) {
    throw new FriendlyMessageError("No saved connections to edit.");
  }

  const currentName = await promptSelect(
    connections.map((connection) => ({
      value: connection.name,
      label: connection.name,
      hint: truncate(connection.uri, 80)
    })),
    "Choose a connection to edit"
  );

  const connection = connections.find((item) => item.name === currentName);

  if (!connection) {
    throw new FriendlyMessageError(`Connection "${currentName}" does not exist.`);
  }

  const name = await promptText({
    message: "Connection name",
    placeholder: "work-vless",
    initialValue: connection.name,
    validate: requiredText("Connection name is required.")
  });

  const uri = await promptText({
    message: "Connection URI",
    placeholder: "vless://... or hysteria2://...",
    initialValue: connection.uri,
    validate: requiredText("Connection URI is required.")
  });
  const warnings = await validateConnectionUri(uri);

  for (const warning of warnings) {
    log.warn(warning);
  }

  const updatedConnection = await updateConnection(currentName, name, uri, context.service);
  log.success(`Updated connection "${updatedConnection.name}".`);
}

async function runConnectionsRemove(context: AppContext): Promise<void> {
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

  const result = await removeConnection(name, context.service);
  log.success(`Removed connection "${name}".`);

  if (result.clearedActiveConnection) {
    log.warn('Removed the active connection from the current selection and deleted config.json.');

    if (result.stoppedService) {
      log.warn(`Stopped the ${context.service.getInfo().displayName} because it was using the deleted active selection.`);
    }
  }
}
