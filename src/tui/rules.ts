import { log } from "@clack/prompts";
import { FriendlyMessageError, promptConfirm, promptMultiline, promptSelect, promptText } from "../cli.js";
import { runCommandStreaming } from "../process.js";
import {
  createRuleSet,
  getRuleSet,
  getRuleSetFilePath,
  listRuleSets,
  rebuildGeneratedConfigForActiveSelection,
  removeRuleSet,
  setRulesForRuleSet
} from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";
import { requiredText } from "./shared.js";

type RuleSetsAction = "add" | "back" | "edit" | "remove";

export async function runRulesMenu(): Promise<void> {
  await runChildMenuLoop<RuleSetsAction>({
    select: () =>
      promptSelect<RuleSetsAction>(
        [
          {
            value: "add",
            label: "Add",
            hint: "Create a new named rule set and define its rules"
          },
          {
            value: "edit",
            label: "Edit",
            hint: "Edit the full rules list of an existing rule set"
          },
          {
            value: "remove",
            label: "Remove",
            hint: "Delete an existing rule set"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Rule Sets"
      ),
    onSelect: async (action) => {
      switch (action) {
        case "add":
          await runRuleSetsAdd();
          return "continue";
        case "edit":
          await runRuleSetsEdit();
          return "continue";
        case "remove":
          await runRuleSetsRemove();
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runRuleSetsAdd(): Promise<void> {
  const name = await promptText({
    message: "Rule set name",
    placeholder: "google",
    validate: requiredText("Rule set name is required.")
  });

  const rules = await promptRules("");
  const ruleSet = await createRuleSet(name, rules);
  log.success(`Created rule set "${ruleSet.name}".`);
}

async function runRuleSetsEdit(): Promise<void> {
  const ruleSets = await listRuleSets();

  if (ruleSets.length === 0) {
    throw new FriendlyMessageError("Create a rule set before editing it.");
  }

  const ruleSetName = await promptSelect(
    ruleSets.map((ruleSet) => ({
      value: ruleSet.name,
      label: ruleSet.name,
      hint: ruleSet.rules.length > 0 ? `${ruleSet.rules.length} rules` : "No rules yet"
    })),
    "Choose a rule set"
  );

  const ruleSet = ruleSets.find((item) => item.name === ruleSetName);

  if (!ruleSet) {
    throw new FriendlyMessageError(`Rule set "${ruleSetName}" does not exist.`);
  }

  await runCommandStreaming("open", [getRuleSetFilePath(ruleSet.name)]);
  log.success(`Opened rule set "${ruleSetName}".`);

  const editFinished = await promptConfirm({
    message: "Finished editing the rule set? Press Enter to confirm.",
    initialValue: true
  });

  if (!editFinished) {
    log.info("Skipped config rebuild.");
    return;
  }

  await getRuleSet(ruleSetName);

  const rebuilt = await rebuildGeneratedConfigForActiveSelection();

  if (rebuilt) {
    log.success("Rebuilt config.json from the active selection.");
  } else {
    log.info("No active selection to rebuild.");
  }
}

async function runRuleSetsRemove(): Promise<void> {
  const ruleSets = await listRuleSets();

  if (ruleSets.length === 0) {
    throw new FriendlyMessageError("No rule sets to remove.");
  }

  const ruleSetName = await promptSelect(
    ruleSets.map((ruleSet) => ({
      value: ruleSet.name,
      label: ruleSet.name,
      hint: ruleSet.rules.length > 0 ? `${ruleSet.rules.length} rules` : "No rules yet"
    })),
    "Choose a rule set to remove"
  );

  await removeRuleSet(ruleSetName);
  log.success(`Removed rule set "${ruleSetName}".`);
}

async function promptRules(initialValue: string): Promise<string> {
  log.info("Enter rules one per line.");
  log.info("Supported formats:");
  log.step("domain:google.com for an exact domain");
  log.step("domain_suffix:google.com for a domain and its subdomains");
  log.step("ip_cidr:1.2.3.4 for a single IP");
  log.step("ip_cidr:1.2.3.0/24 for a subnet");
  log.step("Press Tab to focus [ submit ], then press Enter.");

  return promptMultiline({
    message: "Rules",
    placeholder: "domain:google.com\ndomain_suffix:google.com\nip_cidr:1.2.3.0/24",
    initialValue,
    showSubmit: true
  });
}
