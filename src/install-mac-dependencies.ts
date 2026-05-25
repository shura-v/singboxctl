import { homedir } from "node:os";
import { join } from "node:path";
import { outro } from "@clack/prompts";
import { FriendlyMessageError } from "./cli.js";
import { runCommandCapture, runCommandStreaming } from "./process.js";

const MAC_PREREQUISITES_MESSAGE = [
  "macOS prerequisites:",
  "- Homebrew",
  '- Run "singboxctl install-mac-deps"',
  "- Add the reported Go bin directory to your PATH"
].join("\n");

export async function runInstallMacDependencies(): Promise<void> {
  ensureMacOS();

  await runCommandStreaming("brew", ["install", "go", "sing-box"]);
  await runCommandStreaming("go", ["install", "github.com/gvcgo/vpnparser@latest"]);

  const goBinDirectory = await resolveGoBinDirectory();

  outro(`Dependencies installed. Add "${formatPathForDisplay(goBinDirectory)}" to your PATH.`);
}

export async function assertMacRuntimeDependenciesInstalled(): Promise<void> {
  ensureMacOS();

  if (!(await isCommandAvailable("sing-box")) || !(await isCommandAvailable("vpnparser"))) {
    throw new FriendlyMessageError(MAC_PREREQUISITES_MESSAGE);
  }
}

export async function resolveGoBinDirectory(): Promise<string> {
  ensureMacOS();

  const goBin = await readGoEnvValue("GOBIN");

  if (goBin.length > 0) {
    return goBin;
  }

  const goPath = await readGoEnvValue("GOPATH");

  if (goPath.length === 0) {
    throw new FriendlyMessageError("Go returned an empty GOPATH.");
  }

  return join(goPath, "bin");
}

export function ensureMacOS(): void {
  if (process.platform !== "darwin") {
    throw new FriendlyMessageError("singboxctl currently supports only macOS.");
  }
}

async function readGoEnvValue(name: "GOBIN" | "GOPATH"): Promise<string> {
  const result = await runCommandCapture("go", ["env", name]);

  if (result.code !== 0) {
    throw new FriendlyMessageError(result.stderr.trim() || `Failed to resolve ${name}.`);
  }

  return result.stdout.trim();
}

async function isCommandAvailable(command: string): Promise<boolean> {
  const result = await runCommandCapture("which", [command]);
  return result.code === 0;
}

export function formatPathForDisplay(filePath: string): string {
  const homeDirectory = homedir();

  if (filePath === homeDirectory) {
    return "~";
  }

  if (filePath.startsWith(`${homeDirectory}/`)) {
    return `~${filePath.slice(homeDirectory.length)}`;
  }

  return filePath;
}
