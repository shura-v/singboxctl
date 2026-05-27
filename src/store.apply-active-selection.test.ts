import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRuntimeDependencies } from "./test-helpers.js";

describe("applyActiveSelection", () => {
  beforeEach(async () => {
    process.env.HOME = await mkdtemp(join(tmpdir(), "singboxctl-apply-selection-test-"));
    vi.resetModules();
  });

  it("updates the active selection after config generation and before service restart", async () => {
    vi.doMock("./sing-box-config.js", () => ({
      buildAndWriteGeneratedConfig: async (connectionName: string, profileName: string) => {
        const configPath = join(process.env.HOME!, ".config", "singboxctl", "config.json");
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, `${JSON.stringify({ connectionName, profileName })}\n`, "utf8");

        return {
          configPath
        };
      }
    }));

    const {
      addConnection,
      addProfile,
      applyActiveSelection,
      getActiveConnectionName,
      getActiveProfileName,
      getGeneratedConfigPath,
      setActiveSelection
    } = await import("./store.js");

    await addConnection("Old", "vless://old");
    await addConnection("New", "vless://new");
    await addProfile("Office");
    await setActiveSelection("Old", "Office");

    await expect(
      applyActiveSelection("New", "Office", mockRuntimeDependencies({
        restartIfInstalled: async () => {
          throw new Error("kickstart failed");
        },
      }))
    ).rejects.toThrow("kickstart failed");

    expect(await getActiveConnectionName()).toBe("New");
    expect(await getActiveProfileName()).toBe("Office");
    expect(JSON.parse(await readFile(getGeneratedConfigPath(), "utf8"))).toEqual({
      connectionName: "New",
      profileName: "Office"
    });
  });
});
