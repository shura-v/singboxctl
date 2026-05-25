export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function requiredText(message: string) {
  return (value: string | undefined) => {
    if (!value || value.trim().length === 0) {
      return message;
    }

    return undefined;
  };
}

export function readConnectionNameDefault(uri: string): string {
  const hashIndex = uri.indexOf("#");

  if (hashIndex < 0 || hashIndex === uri.length - 1) {
    return "";
  }

  const rawFragment = uri.slice(hashIndex + 1).trim();

  try {
    return decodeURIComponent(rawFragment).trim();
  } catch {
    return rawFragment;
  }
}
