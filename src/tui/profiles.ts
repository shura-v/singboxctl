import type { AppContext } from "../app-context.js";
import { log } from "@clack/prompts";
import { FriendlyMessageError, promptMultiSelect, promptSelect, promptText } from "../cli.js";
import { addProfile, listProfiles, listRuleSets, removeProfile, setProfileRuleSets } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type ProfilesAction = "add" | "back" | "remove" | "set-rule-sets";

export async function runProfilesMenu(context: AppContext): Promise<void> {
  await runChildMenuLoop<ProfilesAction>({
    select: () =>
      promptSelect<ProfilesAction>(
        [
          {
            value: "add",
            label: "Add",
            hint: "Create a new profile"
          },
          {
            value: "remove",
            label: "Remove",
            hint: "Delete an existing profile"
          },
          {
            value: "set-rule-sets",
            label: "Set Rule Sets",
            hint: "Choose which rule sets are included in a profile"
          },
          {
            value: "back",
            label: "Back"
          }
        ],
        "Profiles"
      ),
    onSelect: async (action) => {
      switch (action) {
        case "add":
          await runProfilesAdd();
          return "continue";
        case "remove":
          await runProfilesRemove(context);
          return "continue";
        case "set-rule-sets":
          await runProfilesSetRuleSets(context);
          return "continue";
        case "back":
          return "back";
      }
    }
  });
}

async function runProfilesAdd(): Promise<void> {
  const name = await promptText({
    message: "Profile name",
    placeholder: "work"
  });

  const profile = await addProfile(name);
  log.success(`Created profile "${profile.name}".`);
}

async function runProfilesRemove(context: AppContext): Promise<void> {
  const profiles = (await listProfiles()).filter((profile) => !profile.builtIn);

  if (profiles.length === 0) {
    throw new FriendlyMessageError("No user profiles to remove.");
  }

  const name = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: profile.ruleSetNames.length > 0 ? `${profile.ruleSetNames.length} rule sets` : "No rule sets yet"
    })),
    "Choose a profile to remove"
  );

  const result = await removeProfile(name, context.service);
  log.success(`Removed profile "${name}".`);

  if (result.clearedActiveProfile) {
    log.warn('Removed the active profile from the current selection and deleted config.json.');

    if (result.stoppedService) {
      log.warn(`Stopped the ${context.service.getInfo().displayName} because it was using the deleted active selection.`);
    }
  }
}

async function runProfilesSetRuleSets(context: AppContext): Promise<void> {
  const profiles = (await listProfiles()).filter((profile) => !profile.builtIn);

  if (profiles.length === 0) {
    throw new FriendlyMessageError("Create a user profile before assigning rule sets.");
  }

  const ruleSets = await listRuleSets();

  if (ruleSets.length === 0) {
    throw new FriendlyMessageError("Create a rule set before assigning it to a profile.");
  }

  const profileName = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: profile.ruleSetNames.length > 0 ? `${profile.ruleSetNames.length} selected` : "No rule sets yet"
    })),
    "Choose a profile"
  );

  const profile = profiles.find((item) => item.name === profileName);

  if (!profile) {
    throw new FriendlyMessageError(`Profile "${profileName}" does not exist.`);
  }

  const selectedRuleSets = await promptMultiSelect(
    ruleSets.map((ruleSet) => ({
      value: ruleSet.name,
      label: ruleSet.name,
      hint: ruleSet.rules.length > 0 ? `${ruleSet.rules.length} rules` : "No rules yet"
    })),
    "Choose rule sets for this profile",
    profile.ruleSetNames
  );

  await setProfileRuleSets(profileName, selectedRuleSets, context.service);
  log.success(
    `Profile "${profileName}" now uses ${selectedRuleSets.length} rule set${selectedRuleSets.length === 1 ? "" : "s"}.`
  );
}
