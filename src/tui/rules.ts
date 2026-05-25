import { log } from "@clack/prompts";
import { FriendlyMessageError, promptMultiSelect, promptMultiline, promptSelect } from "../cli.js";
import { addDomainsToProfile, listProfiles, removeRulesFromProfile } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type RulesAction = "add" | "back" | "remove";

export async function runRulesMenu(): Promise<void> {
  await runChildMenuLoop<RulesAction>({
    select: () =>
      promptSelect<RulesAction>(
        [
          {
            value: "add",
            label: "Add",
            hint: "Add one or more sing-box match rules to a profile"
          },
          {
            value: "remove",
            label: "Remove",
            hint: "Remove one or more rules from a profile"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Rules"
      ),
    onSelect: async (action) => {
      switch (action) {
        case "add":
          await runRulesAdd();
          return "continue";
        case "remove":
          await runRulesRemove();
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runRulesAdd(): Promise<void> {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    throw new FriendlyMessageError("Create a profile before adding rules.");
  }

  const profileName = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: profile.domains.length > 0 ? `${profile.domains.length} rules` : "No rules yet"
    })),
    "Choose a profile"
  );

  log.info("Enter rules one per line.");
  log.info("Supported formats:");
  log.step("domain:google.com for an exact domain");
  log.step("domain_suffix:google.com for a domain and its subdomains");
  log.step("ip_cidr:1.2.3.4 for a single IP");
  log.step("ip_cidr:1.2.3.0/24 for a subnet");
  log.step("Press Tab to focus [ submit ], then press Enter.");

  const rawInput = await promptMultiline({
    message: "Rules",
    placeholder: "domain:google.com\ndomain_suffix:google.com\nip_cidr:1.2.3.0/24",
    showSubmit: true
  });

  const added = await addDomainsToProfile(profileName, rawInput);

  if (added.length === 0) {
    log.step("No new rules were added.");
    return;
  }

  log.success(`Added ${added.length} rule entr${added.length === 1 ? "y" : "ies"} to "${profileName}".`);
}

async function runRulesRemove(): Promise<void> {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    throw new FriendlyMessageError("Create a profile before removing rules.");
  }

  const profileName = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: profile.domains.length > 0 ? `${profile.domains.length} rules` : "No rules yet"
    })),
    "Choose a profile"
  );

  const profile = profiles.find((item) => item.name === profileName);

  if (!profile || profile.domains.length === 0) {
    throw new FriendlyMessageError(`Profile "${profileName}" has no rules to remove.`);
  }

  const selectedRules = await promptMultiSelect(
    profile.domains.map((rule) => ({
      value: rule,
      label: rule
    })),
    "Choose rules to remove"
  );

  if (selectedRules.length === 0) {
    log.step("No rules selected.");
    return;
  }

  const removedRules = await removeRulesFromProfile(profileName, selectedRules);
  log.success(`Removed ${removedRules.length} rule entr${removedRules.length === 1 ? "y" : "ies"} from "${profileName}".`);
}
