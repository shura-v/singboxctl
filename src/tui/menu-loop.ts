import { cancel, outro } from "@clack/prompts";
import { isPromptCancelledError } from "../cli.js";

export async function runRootMenuLoop<T extends string>(options: {
  onSelect: (action: T) => Promise<"continue" | "exit" | void>;
  select: () => Promise<T>;
}): Promise<void> {
  while (true) {
    let action: T;

    try {
      action = await options.select();
    } catch (error) {
      if (isPromptCancelledError(error)) {
        outro("Bye.");
        return;
      }

      throw error;
    }

    try {
      const result = await options.onSelect(action);

      if (result === "exit") {
        return;
      }
    } catch (error) {
      if (isPromptCancelledError(error)) {
        continue;
      }

      cancel(error instanceof Error ? error.message : "Unknown error.");
    }
  }
}

export async function runChildMenuLoop<T extends string>(options: {
  onSelect: (action: T) => Promise<"back" | "continue" | void>;
  select: () => Promise<T>;
}): Promise<void> {
  while (true) {
    let action: T;

    try {
      action = await options.select();
    } catch (error) {
      if (isPromptCancelledError(error)) {
        return;
      }

      throw error;
    }

    try {
      const result = await options.onSelect(action);

      if (result === "back") {
        return;
      }
    } catch (error) {
      if (isPromptCancelledError(error)) {
        continue;
      }

      cancel(error instanceof Error ? error.message : "Unknown error.");
    }
  }
}
