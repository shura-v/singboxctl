import { log } from "@clack/prompts";
import { FriendlyMessageError, promptSelect, promptText } from "../cli.js";
import { addProfile, listProfiles, removeProfile } from "../store.js";
import { runChildMenuLoop } from "./menu-loop.js";

type ProfilesAction = "add" | "back" | "remove";

export async function runProfilesMenu(): Promise<void> {
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
          await runProfilesRemove();
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

async function runProfilesRemove(): Promise<void> {
  const profiles = await listProfiles();

  if (profiles.length === 0) {
    throw new FriendlyMessageError("No profiles to remove.");
  }

  const name = await promptSelect(
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: profile.domains.length > 0 ? `${profile.domains.length} rules` : "No rules yet"
    })),
    "Choose a profile to remove"
  );

  await removeProfile(name);
  log.success(`Removed profile "${name}".`);
}
