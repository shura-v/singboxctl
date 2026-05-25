import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./process.js", () => ({
  runCommandCapture: vi.fn(),
  runCommandStreaming: vi.fn()
}));

describe("platform helpers", () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  it("fails with prerequisites text when sing-box is not on PATH", async () => {
    const { runCommandCapture } = await import("./process.js");
    vi.mocked(runCommandCapture).mockResolvedValue({
      code: 1,
      stderr: "",
      stdout: ""
    });

    const { assertMacRuntimePrerequisitesInstalled } = await import("./platform.js");

    await expect(assertMacRuntimePrerequisitesInstalled()).rejects.toMatchObject({
      message: [
        "macOS prerequisites:",
        "- Install Homebrew if needed: https://brew.sh/",
        "- Install sing-box with Homebrew:",
        "  brew install sing-box"
      ].join("\n")
    });
  });

  it("accepts macOS when sing-box is available", async () => {
    const { runCommandCapture } = await import("./process.js");
    vi.mocked(runCommandCapture).mockResolvedValue({
      code: 0,
      stderr: "",
      stdout: "/opt/homebrew/bin/sing-box\n"
    });

    const { assertMacRuntimePrerequisitesInstalled } = await import("./platform.js");

    await expect(assertMacRuntimePrerequisitesInstalled()).resolves.toBeUndefined();
  });

  it("fails outside macOS", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const { ensureMacOS } = await import("./platform.js");

    expect(() => ensureMacOS()).toThrow("singboxctl currently supports only macOS.");
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
});
