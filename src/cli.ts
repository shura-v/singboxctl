import { cancel, isCancel, log, multiline, multiselect, select, text } from "@clack/prompts";

export class PromptCancelledError extends Error {
  constructor() {
    super("Prompt cancelled.");
    this.name = "PromptCancelledError";
  }
}

export class FriendlyMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyMessageError";
  }
}

export function cancelWithMessage(message: string): never {
  cancel(message);
  process.exit(1);
}

export type SelectOption<T extends string> = {
  hint?: string;
  label: string;
  value: T;
};

export async function promptText(options: {
  defaultValue?: string;
  initialValue?: string;
  message: string;
  placeholder?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}): Promise<string> {
  const result = await text({
    defaultValue: options.defaultValue,
    initialValue: options.initialValue,
    message: options.message,
    placeholder: options.placeholder,
    validate: options.validate
  });

  return unwrapPrompt(result) ?? "";
}

export async function promptSelect<T extends string>(
  options: SelectOption<T>[],
  message: string
): Promise<T> {
  const result = await select({
    message,
    options: options as Parameters<typeof select<T>>[0]["options"]
  });

  return unwrapPrompt(result);
}

export async function promptMultiSelect<T extends string>(
  options: SelectOption<T>[],
  message: string
): Promise<T[]> {
  const result = await multiselect({
    message,
    options: options as Parameters<typeof multiselect<T>>[0]["options"],
    required: false
  });

  return unwrapPrompt(result);
}

export async function promptMultiline(options: {
  initialValue?: string;
  message: string;
  placeholder?: string;
  showSubmit?: boolean;
  validate?: (value: string | undefined) => string | Error | undefined;
}): Promise<string> {
  const result = await multiline({
    initialValue: options.initialValue,
    message: options.message,
    placeholder: options.placeholder,
    showSubmit: options.showSubmit,
    validate: options.validate
  });

  return unwrapPrompt(result) ?? "";
}

export function failAndExit(error: unknown): never {
  if (isPromptCancelledError(error)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  if (isFriendlyMessageError(error)) {
    log.warn(error.message);
    process.exit(1);
  }

  cancel(error instanceof Error ? error.message : "Unknown error.");
  process.exit(1);
}

export function isPromptCancelledError(error: unknown): error is PromptCancelledError {
  return error instanceof PromptCancelledError;
}

export function isFriendlyMessageError(error: unknown): error is FriendlyMessageError {
  return error instanceof FriendlyMessageError;
}

function unwrapPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new PromptCancelledError();
  }

  return value;
}
