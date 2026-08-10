#!/usr/bin/env node

import { createRequire } from "node:module";
import { intro, log } from "@clack/prompts";
import { cancelWithMessage, failAndExit } from "./cli.js";
import { connect } from "./connect.js";
import { generateConfigForProfile } from "./generate-config.js";
import { createAppContext } from "./platform.js";
import { runTui } from "./tui.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  intro(`singboxctl v${version}`);

  if ((args.length === 2 || args.length === 3) && args[0] === "generate") {
    const result = await generateConfigForProfile(args[1], args[2]);
    log.success(`Generated config at ${result.configPath}`);
    return;
  }

  const context = createAppContext();
  await context.assertRuntimePrerequisitesInstalled();

  if (args.length === 0) {
    await runTui(context);
    return;
  }

  if (args.length === 1 && args[0] === "connect") {
    await connect(context);
    return;
  }

  cancelWithMessage(
    'Use "singboxctl" for the menu, "singboxctl connect" to start sing-box, or "singboxctl generate <profile> [output-path]" to generate a config.'
  );
}

void main().catch((error: unknown) => {
  failAndExit(error);
});
