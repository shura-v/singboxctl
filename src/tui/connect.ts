import { log } from "@clack/prompts";
import { connect } from "../connect.js";

export async function runConnectFlow(): Promise<void> {
  log.step("Starting sing-box in debug mode in the foreground. Logs will be printed in this terminal. You may be asked for your macOS password.");
  const result = await connect();
  log.success(`Started sing-box with ${result.configPath}.`);
}
