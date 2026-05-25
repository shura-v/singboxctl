#!/usr/bin/env node

import { createRequire } from "node:module";
import { intro } from "@clack/prompts";
import { cancelWithMessage, failAndExit } from "./cli.js";
import { assertMacRuntimeDependenciesInstalled, ensureMacOS, runInstallMacDependencies } from "./install-mac-dependencies.js";
import { runTui } from "./tui.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  intro(`singboxctl v${version}`);

  if (isInstallDependenciesInvocation(args)) {
    await runInstallMacDependencies();
    return;
  }

  if (args.length === 0) {
    ensureMacOS();
    await assertMacRuntimeDependenciesInstalled();
    await runTui();
    return;
  }

  cancelWithMessage('Use "singboxctl install-mac-deps" or start without arguments to open the menu.');
}

function isInstallDependenciesInvocation(args: string[]): args is ["install-mac-deps"] {
  return args.length === 1 && args[0] === "install-mac-deps";
}

void main().catch((error: unknown) => {
  failAndExit(error);
});
