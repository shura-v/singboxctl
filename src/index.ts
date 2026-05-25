#!/usr/bin/env node

import { createRequire } from "node:module";
import { intro } from "@clack/prompts";
import { cancelWithMessage, failAndExit } from "./cli.js";
import { connect } from "./connect.js";
import { assertMacRuntimePrerequisitesInstalled, ensureMacOS } from "./platform.js";
import { runTui } from "./tui.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  intro(`singboxctl v${version}`);

  ensureMacOS();
  await assertMacRuntimePrerequisitesInstalled();

  if (args.length === 0) {
    await runTui();
    return;
  }

  if (args.length === 1 && args[0] === "connect") {
    await connect();
    return;
  }

  cancelWithMessage('Use "singboxctl" for the menu or "singboxctl connect" to start sing-box.');
}

void main().catch((error: unknown) => {
  failAndExit(error);
});
