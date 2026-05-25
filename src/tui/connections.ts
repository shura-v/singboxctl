import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect, promptText } from "../cli.js";
import { addConnection, listConnections, removeConnection, updateConnection } from "../store.js";
import { validateConnectionUri } from "../vless-uri/index.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { readConnectionNameDefault, requiredText, truncate } from "./shared.js";

type ConnectionsAction = "add" | "back" | "edit" | "remove";

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
            value: "edit",
            label: "Edit",
            hint: connections.length > 0 ? "Update a saved connection" : "No saved connections yet"
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
        case "edit":
          await runConnectionsEdit();
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

async function runConnectionsEdit(): Promise<void> {
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

  const uri = await promptText({
    message: "Connection URI",
    placeholder: "vless://...",
    initialValue: connection.uri,
    validate: requiredText("Connection URI is required.")
  });
  const warnings = await validateConnectionUri(uri);

  for (const warning of warnings) {
    log.warn(warning);
  }

  const name = await promptText({
    message: "Connection name",
    placeholder: "work-vless",
    initialValue: connection.name,
    validate: requiredText("Connection name is required.")
  });

  const updatedConnection = await updateConnection(currentName, name, uri);
  log.success(`Updated connection "${updatedConnection.name}".`);
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

  const result = await removeConnection(name);
  log.success(`Removed connection "${name}".`);

  if (result.clearedActiveConnection) {
    log.warn('Removed the active connection from the current selection and deleted config.json.');

    if (result.stoppedService) {
      log.warn("Stopped the launchd service because it was using the deleted active selection.");
    }
  }
}
