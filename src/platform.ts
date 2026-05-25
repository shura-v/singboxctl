import { FriendlyMessageError } from "./cli.js";
import { runCommandCapture } from "./process.js";

const MAC_PREREQUISITES_MESSAGE = [
  "macOS prerequisites:",
  "- Install Homebrew if needed: https://brew.sh/",
  "- Install sing-box with Homebrew:",
  "  brew install sing-box"
].join("\n");

export async function assertMacRuntimePrerequisitesInstalled(): Promise<void> {
  ensureMacOS();

  if (!(await isCommandAvailable("sing-box"))) {
    throw new FriendlyMessageError(MAC_PREREQUISITES_MESSAGE);
  }
}

export function ensureMacOS(): void {
  if (process.platform !== "darwin") {
    throw new FriendlyMessageError("singboxctl currently supports only macOS.");
  }
}

async function isCommandAvailable(command: string): Promise<boolean> {
  const result = await runCommandCapture("which", [command]);
  return result.code === 0;
}
