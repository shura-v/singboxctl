import { log } from "@clack/prompts";
import { connect } from "../connect.js";

export async function runConnectFlow(): Promise<void> {
  log.step("Starting sing-box in foreground. You may be asked for your macOS password.");
  const result = await connect();
  log.success(`Started sing-box with ${result.configPath}.`);
}
