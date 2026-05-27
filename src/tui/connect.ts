import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { connect } from "../connect.js";

export async function runConnectFlow(context: AppContext): Promise<void> {
  log.step(
    `Starting sing-box in debug mode in the foreground. Logs will be printed in this terminal. You may be asked for your ${context.service.getInfo().privilegePrompt}.`
  );
  const result = await connect(context);
  log.success(`Started sing-box with ${result.configPath}.`);
}
