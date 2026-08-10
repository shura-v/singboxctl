import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { generateConfigForProfile } from "./generate-config.js";
import { mockRuntimeDependencies } from "./test-helpers.js";
import {
  addConnection,
  addProfile,
  createRuleSet,
  getActiveConnectionName,
  getActiveProfileName,
  getGeneratedConfigPath,
  setActiveSelection,
  setProfileRuleSets
} from "./store.js";

const VALID_VLESS_URI =
  "vless://2eaab0cc-7cef-4864-9bfe-c7c2374c5c1f@example.com:443?encryption=none&flow=xtls-rprx-vision&fp=ios&pbk=test-public-key&security=reality&sid=48b32b4141bb&sni=cdn.jsdelivr.net&type=tcp#work";

const runtime = mockRuntimeDependencies();
let testHomePath: string;

describe("generate config command", () => {
  beforeEach(async () => {
    testHomePath = await mkdtemp(join(tmpdir(), "singboxctl-generate-test-"));
    process.env.HOME = testHomePath;
  });

  it("writes the requested profile to an explicit path without changing the active selection", async () => {
    await prepareProfiles();
    const outputPath = join(testHomePath, "artifacts", "router", "config.json");

    const result = await generateConfigForProfile("Router", outputPath);

    expect(result).toEqual({
      configPath: outputPath,
      connectionName: "Work",
      profileName: "Router"
    });
    expect(await getActiveConnectionName()).toBe("Work");
    expect(await getActiveProfileName()).toBe("Office");
    await expect(readFile(getGeneratedConfigPath(), "utf8")).rejects.toThrow();

    const config = JSON.parse(await readFile(outputPath, "utf8")) as {
      route: { rules: Array<{ domain?: string[] }> };
    };
    expect(config.route.rules).toContainEqual({
      action: "route",
      outbound: "proxy",
      domain: ["router.example"]
    });
    expect(config.route.rules).not.toContainEqual(
      expect.objectContaining({ domain: ["office.example"] })
    );
  });

  it("uses the standard config path when the output path is omitted", async () => {
    await prepareProfiles();

    const result = await generateConfigForProfile("Router");

    expect(result.configPath).toBe(getGeneratedConfigPath());
    await expect(readFile(result.configPath, "utf8")).resolves.toContain("router.example");
  });

  it("requires an active connection", async () => {
    await addProfile("Router");

    await expect(generateConfigForProfile("Router")).rejects.toThrow(
      "Active connection not found. Use Select & Apply first."
    );
  });
});

async function prepareProfiles(): Promise<void> {
  await addConnection("Work", VALID_VLESS_URI);
  await addProfile("Office");
  await addProfile("Router");
  await createRuleSet("Office rules", "domain:office.example");
  await createRuleSet("Router rules", "domain:router.example");
  await setProfileRuleSets("Office", ["Office rules"], runtime);
  await setProfileRuleSets("Router", ["Router rules"], runtime);
  await setActiveSelection("Work", "Office");
}
