import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./process.js", () => ({
  runCommandCapture: vi.fn(),
  runCommandStreaming: vi.fn()
}));

describe("install mac dependencies helpers", () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  it("prefers GOBIN over GOPATH/bin", async () => {
    const { runCommandCapture } = await import("./process.js");
    vi.mocked(runCommandCapture).mockImplementation(async (_command, args) => {
      const envName = args[1];

      if (envName === "GOBIN") {
        return { code: 0, stderr: "", stdout: "/custom/go/bin\n" };
      }

      if (envName === "GOPATH") {
        return { code: 0, stderr: "", stdout: "/Users/example/go\n" };
      }

      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });

    const { resolveGoBinDirectory } = await import("./install-mac-dependencies.js");

    await expect(resolveGoBinDirectory()).resolves.toBe("/custom/go/bin");
  });

  it("falls back to GOPATH/bin when GOBIN is empty", async () => {
    const { runCommandCapture } = await import("./process.js");
    vi.mocked(runCommandCapture).mockImplementation(async (_command, args) => {
      const envName = args[1];

      if (envName === "GOBIN") {
        return { code: 0, stderr: "", stdout: "\n" };
      }

      if (envName === "GOPATH") {
        return { code: 0, stderr: "", stdout: "/Users/example/go\n" };
      }

      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });

    const { resolveGoBinDirectory } = await import("./install-mac-dependencies.js");

    await expect(resolveGoBinDirectory()).resolves.toBe("/Users/example/go/bin");
  });

  it("fails with prerequisites text when required commands are not on PATH", async () => {
    const { runCommandCapture } = await import("./process.js");
    vi.mocked(runCommandCapture).mockImplementation(async (_command, args) => {
      if (args[0] === "sing-box") {
        return { code: 0, stderr: "", stdout: "/opt/homebrew/bin/sing-box\n" };
      }

      if (args[0] === "vpnparser") {
        return { code: 1, stderr: "", stdout: "" };
      }

      throw new Error(`Unexpected args: ${args.join(" ")}`);
    });

    const { assertMacRuntimeDependenciesInstalled } = await import("./install-mac-dependencies.js");

    await expect(assertMacRuntimeDependenciesInstalled()).rejects.toMatchObject({
      message: [
        "macOS prerequisites:",
        "- Homebrew",
        '- Run "singboxctl install-mac-deps"',
        "- Add the reported Go bin directory to your PATH"
      ].join("\n")
    });
  });

  it("formats a home-relative path with ~ for display", async () => {
    const { formatPathForDisplay } = await import("./install-mac-dependencies.js");

    expect(formatPathForDisplay(join(homedir(), "go", "bin"))).toBe("~/go/bin");
  });

  it("fails outside macOS", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const { ensureMacOS } = await import("./install-mac-dependencies.js");

    expect(() => ensureMacOS()).toThrow("singboxctl currently supports only macOS.");
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
});
