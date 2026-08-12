import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMacOSAppContext } from "./platform/macos.js";
import { createAppContext, ensureMacOS, ensureSupportedPlatform } from "./platform.js";

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
    expect(() => ensureSupportedPlatform()).toThrow("Platform not implemented yet: win32.");
  });

  it("accepts Linux without distribution detection", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    expect(() => ensureSupportedPlatform()).not.toThrow();
    expect(createAppContext().service.getInfo()).toMatchObject({
      definitionPath: "/etc/systemd/system/singboxctl.service",
      label: "singboxctl.service"
    });
  });

  it("keeps ensureMacOS restricted to macOS", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    expect(() => ensureMacOS()).toThrow("Platform not implemented yet: linux.");
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
});
