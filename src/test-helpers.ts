import type { RuntimeDependencies } from "./app-context.js";

export function mockRuntimeDependencies(
  overrides: Partial<RuntimeDependencies> = {}
): RuntimeDependencies {
  return {
    disableIfInstalled: async () => false,
    restartIfInstalled: async () => false,
    stopIfInstalled: async () => false,
    ...overrides
  };
}
