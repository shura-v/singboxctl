import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMacOSAppContext } from "./platform/macos.js";
import { createAppContext, ensureMacOS } from "./platform.js";

describe("platform helpers", () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  it("fails with prerequisites text when sing-box is not on PATH", async () => {
    const context = createMacOSAppContext({
      pathResolver: async () => {
        throw new Error("missing");
      }
    });

    await expect(context.assertRuntimePrerequisitesInstalled()).rejects.toMatchObject({
      message: [
        "macOS prerequisites:",
        "- Install Homebrew if needed: https://brew.sh/",
        "- Install sing-box with Homebrew:",
        "  brew install sing-box"
      ].join("\n")
    });
  });

  it("accepts macOS when sing-box is available", async () => {
    const context = createMacOSAppContext({
      pathResolver: async () => "/opt/homebrew/bin/sing-box"
    });

    await expect(context.assertRuntimePrerequisitesInstalled()).resolves.toBeUndefined();
  });

  it("fails outside macOS", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(() => ensureMacOS()).toThrow("Platform not implemented yet: win32.");
  });

  it("fails to create an app context for unsupported platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(() => createAppContext()).toThrow("Platform not implemented yet: linux.");
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
});
