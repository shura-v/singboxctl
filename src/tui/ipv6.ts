import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect } from "../cli.js";
import { getIpv6Enabled, setIpv6Enabled } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { runAndLogRuntimeRefresh } from "./shared.js";

type IPv6Action = "back" | "disable" | "enable";

export async function runIpv6Menu(context: AppContext): Promise<void> {
  await runChildMenuLoop<IPv6Action>({
    select: async () => {
      const ipv6Enabled = await getIpv6Enabled();

      return promptSelect<IPv6Action>(
        [
          {
            value: "enable",
            label: "Enable",
            hint: ipv6Enabled ? "Currently enabled" : "Add an IPv6 TUN address to config.json"
          },
          {
            value: "disable",
            label: "Disable",
            hint: ipv6Enabled ? "Remove the IPv6 TUN address from config.json" : "Currently disabled"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "IPv6"
      );
    },
    onSelect: async (action) => {
      switch (action) {
        case "enable":
          await runSetIpv6Enabled(context, true);
          return "continue";
        case "disable":
          await runSetIpv6Enabled(context, false);
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runSetIpv6Enabled(context: AppContext, enabled: boolean): Promise<void> {
  const wasEnabled = await getIpv6Enabled();

  if (wasEnabled === enabled) {
    throw new FriendlyMessageError(`IPv6 is already ${enabled ? "enabled" : "disabled"}.`);
  }

  await runAndLogRuntimeRefresh({
    run: () => setIpv6Enabled(enabled, context.service),
    success: () => `IPv6 ${enabled ? "enabled" : "disabled"}.`
  });
}
