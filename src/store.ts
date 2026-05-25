import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { FriendlyMessageError } from "./cli.js";

export type ConnectionRecord = {
  name: string;
  uri: string;
};

export type ProfileRecord = {
  builtIn?: "full-tunnel";
  name: string;
  ruleSetNames: string[];
};

export type RuleSetRecord = {
  name: string;
  rules: string[];
};

type StoredRuleSetRecord = {
  rules: string[];
};

type AppState = {
  activeConnectionName?: string;
  activeProfileName?: string;
  ipv6Enabled?: boolean;
  serviceIntent?: boolean;
};

export type RemovalResult = {
  clearedActiveConnection: boolean;
  clearedActiveProfile: boolean;
  disabledService: boolean;
  removedGeneratedConfig: boolean;
  restartedService: boolean;
  stoppedService: boolean;
};

export type ActiveSelectionRuntimeResult = {
  activeSelectionComplete: boolean;
  configPath?: string;
  disabledService: boolean;
  removedGeneratedConfig: boolean;
  restartedService: boolean;
  stoppedService: boolean;
};

export const FULL_TUNNEL_PROFILE_NAME = "all-traffic";

const BUILT_IN_PROFILES: ProfileRecord[] = [
  {
    name: FULL_TUNNEL_PROFILE_NAME,
    ruleSetNames: [],
    builtIn: "full-tunnel"
  }
];

export function getDataDirectoryPath(): string {
  return join(homedir(), ".config", "singboxctl");
}

function getConnectionsDirectoryPath(): string {
  return join(getDataDirectoryPath(), "connections");
}

function getProfilesDirectoryPath(): string {
  return join(getDataDirectoryPath(), "profiles");
}

function getRuleSetsDirectoryPath(): string {
  return join(getDataDirectoryPath(), "rule-sets");
}

export function getGeneratedConfigPath(): string {
  return join(getDataDirectoryPath(), "config.json");
}

function getStatePath(): string {
  return join(getDataDirectoryPath(), "state.json");
}

function getConnectionPath(name: string): string {
  return join(getConnectionsDirectoryPath(), `${name}.json`);
}

function getProfilePath(name: string): string {
  return join(getProfilesDirectoryPath(), `${name}.json`);
}

function getRuleSetPath(name: string): string {
  return join(getRuleSetsDirectoryPath(), `${name}.json`);
}

export function getRuleSetFilePath(name: string): string {
  return getRuleSetPath(name);
}

export async function ensureDataDirectories(): Promise<void> {
  await mkdir(getConnectionsDirectoryPath(), { recursive: true });
  await mkdir(getProfilesDirectoryPath(), { recursive: true });
  await mkdir(getRuleSetsDirectoryPath(), { recursive: true });
}

export async function addConnection(name: string, rawUri: string): Promise<ConnectionRecord> {
  const normalizedName = normalizeConnectionName(name);
  const uri = rawUri.trim();

  if (uri.length === 0) {
    throw new FriendlyMessageError("Connection URI cannot be empty.");
  }

  const existing = await readConnectionIfExists(normalizedName);

  if (existing) {
    throw new FriendlyMessageError(`Connection "${normalizedName}" already exists.`);
  }

  const connection: ConnectionRecord = {
    name: normalizedName,
    uri
  };

  await ensureDataDirectories();
  await writeJson(getConnectionPath(connection.name), connection);
  return connection;
}

export async function updateConnection(
  currentName: string,
  nextName: string,
  rawUri: string
): Promise<ConnectionRecord> {
  const connection = await getConnection(currentName);
  const normalizedNextName = normalizeConnectionName(nextName);
  const uri = rawUri.trim();

  if (uri.length === 0) {
    throw new FriendlyMessageError("Connection URI cannot be empty.");
  }

  if (normalizedNextName !== currentName) {
    const existing = await readConnectionIfExists(normalizedNextName);

    if (existing) {
      throw new FriendlyMessageError(`Connection "${normalizedNextName}" already exists.`);
    }
  }

  const nextConnection: ConnectionRecord = {
    name: normalizedNextName,
    uri
  };

  await ensureDataDirectories();
  await writeJson(getConnectionPath(nextConnection.name), nextConnection);

  if (normalizedNextName !== connection.name) {
    await rm(getConnectionPath(connection.name), { force: true });
  }

  const state = await readState();

  if (state.activeConnectionName === connection.name) {
    state.activeConnectionName = normalizedNextName;
    await writeState(state);
    await rebuildGeneratedConfigForActiveSelection();
  }

  return nextConnection;
}

export async function removeConnection(name: string): Promise<RemovalResult> {
  await rm(getConnectionPath(name), { force: true });

  const state = await readState();

  if (state.activeConnectionName === name) {
    delete state.activeConnectionName;
    await writeState(state);
    const invalidation = await invalidateGeneratedConfigAndStopServiceIfNeeded();
    return {
      clearedActiveConnection: true,
      clearedActiveProfile: false,
      ...invalidation
    };
  }

  return {
    clearedActiveConnection: false,
    clearedActiveProfile: false,
    disabledService: false,
    removedGeneratedConfig: false,
    restartedService: false,
    stoppedService: false
  };
}

export async function listConnections(): Promise<ConnectionRecord[]> {
  await ensureDataDirectories();
  const names = await readJsonFileNames(getConnectionsDirectoryPath());
  const items = await Promise.all(names.map((name) => readJson<ConnectionRecord>(getConnectionPath(name))));
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getConnection(name: string): Promise<ConnectionRecord> {
  const connection = await readConnectionIfExists(name);

  if (!connection) {
    throw new FriendlyMessageError(`Connection "${name}" does not exist.`);
  }

  return connection;
}

export async function addProfile(name: string): Promise<ProfileRecord> {
  const normalizedName = normalizeProfileName(name);

  if (isBuiltInProfileName(normalizedName)) {
    throw new FriendlyMessageError(`Profile "${normalizedName}" is reserved for a built-in profile.`);
  }

  const existing = await readProfileIfExists(normalizedName);

  if (existing) {
    throw new FriendlyMessageError(`Profile "${normalizedName}" already exists.`);
  }

  const profile: ProfileRecord = {
    name: normalizedName,
    ruleSetNames: []
  };

  await ensureDataDirectories();
  await writeJson(getProfilePath(profile.name), profile);
  return profile;
}

export async function addRuleSet(name: string): Promise<RuleSetRecord> {
  const normalizedName = normalizeRuleSetName(name);
  const existing = await readRuleSetIfExists(normalizedName);

  if (existing) {
    throw new FriendlyMessageError(`Rule set "${normalizedName}" already exists.`);
  }

  const ruleSet: RuleSetRecord = {
    name: normalizedName,
    rules: []
  };

  await ensureDataDirectories();
  await writeRuleSet(ruleSet.name, ruleSet.rules);
  return ruleSet;
}

export async function createRuleSet(name: string, rawInput: string): Promise<RuleSetRecord> {
  const normalizedName = normalizeRuleSetName(name);
  const existing = await readRuleSetIfExists(normalizedName);

  if (existing) {
    throw new FriendlyMessageError(`Rule set "${normalizedName}" already exists.`);
  }

  const rules = parseRuleEntries(rawInput);
  const ruleSet: RuleSetRecord = {
    name: normalizedName,
    rules
  };

  await ensureDataDirectories();
  await writeRuleSet(ruleSet.name, ruleSet.rules);
  return ruleSet;
}

export async function removeProfile(name: string): Promise<RemovalResult> {
  if (isBuiltInProfileName(name)) {
    throw new FriendlyMessageError(`Profile "${name}" is built in and cannot be removed.`);
  }

  await rm(getProfilePath(name), { force: true });

  const state = await readState();

  if (state.activeProfileName === name) {
    delete state.activeProfileName;
    await writeState(state);
    const invalidation = await invalidateGeneratedConfigAndStopServiceIfNeeded();
    return {
      clearedActiveConnection: false,
      clearedActiveProfile: true,
      ...invalidation
    };
  }

  return {
    clearedActiveConnection: false,
    clearedActiveProfile: false,
    disabledService: false,
    removedGeneratedConfig: false,
    restartedService: false,
    stoppedService: false
  };
}

export async function removeRuleSet(name: string): Promise<void> {
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(name);
  await rm(getRuleSetPath(name), { force: true });

  const profiles = await listProfiles();

  for (const profile of profiles) {
    if (!profile.ruleSetNames.includes(name)) {
      continue;
    }

    profile.ruleSetNames = profile.ruleSetNames.filter((ruleSetName) => ruleSetName !== name);
    await writeJson(getProfilePath(profile.name), profile);
  }

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection();
  }
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  await ensureDataDirectories();
  const names = await readJsonFileNames(getProfilesDirectoryPath());
  const items = await Promise.all(names.map((name) => readProfile(name)));
  return [...items, ...BUILT_IN_PROFILES].sort(compareProfilesForDisplay);
}

export async function listRuleSets(): Promise<RuleSetRecord[]> {
  await ensureDataDirectories();
  const names = await readJsonFileNames(getRuleSetsDirectoryPath());
  const items = await Promise.all(names.map((name) => readRuleSet(name)));
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getProfile(name: string): Promise<ProfileRecord> {
  return readProfile(name);
}

export async function getRuleSet(name: string): Promise<RuleSetRecord> {
  return readRuleSet(name);
}

export async function setActiveProfile(name: string): Promise<void> {
  const profile = await readProfileIfExists(name);

  if (!profile) {
    throw new FriendlyMessageError(`Profile "${name}" does not exist.`);
  }

  const state = await readState();
  state.activeProfileName = name;
  await writeState(state);
}

export async function getActiveProfileName(): Promise<string | undefined> {
  return (await readState()).activeProfileName;
}

export async function getActiveConnectionName(): Promise<string | undefined> {
  return (await readState()).activeConnectionName;
}

export async function setActiveSelection(connectionName: string, profileName: string): Promise<void> {
  const connection = await readConnectionIfExists(connectionName);
  const profile = await readProfileIfExists(profileName);

  if (!connection) {
    throw new FriendlyMessageError(`Connection "${connectionName}" does not exist.`);
  }

  if (!profile) {
    throw new FriendlyMessageError(`Profile "${profileName}" does not exist.`);
  }

  const state = await readState();
  state.activeConnectionName = connectionName;
  state.activeProfileName = profileName;
  await writeState(state);
}

export async function clearActiveSelection(): Promise<void> {
  const state = await readState();
  delete state.activeConnectionName;
  delete state.activeProfileName;
  await writeState(state);
  await finalizeActiveSelectionRuntime();
}

export async function setServiceIntent(enabled: boolean): Promise<void> {
  const state = await readState();
  state.serviceIntent = enabled;
  await writeState(state);
}

export async function getServiceIntent(): Promise<boolean> {
  return (await readState()).serviceIntent === true;
}

export async function setIpv6Enabled(enabled: boolean): Promise<boolean> {
  const state = await readState();
  state.ipv6Enabled = enabled;
  await writeState(state);
  return rebuildGeneratedConfigForActiveSelection();
}

export async function getIpv6Enabled(): Promise<boolean> {
  return (await readState()).ipv6Enabled === true;
}

export async function rebuildGeneratedConfigForActiveSelection(): Promise<boolean> {
  const result = await finalizeActiveSelectionRuntime();
  return result.activeSelectionComplete;
}

export async function finalizeActiveSelectionRuntime(): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();

  if (!state.activeConnectionName || !state.activeProfileName) {
    const disabledService = await disableInstalledServiceIfNeeded();
    const stoppedService = await stopInstalledServiceIfNeeded();
    const removedGeneratedConfig = await removeGeneratedConfigIfExists();

    return {
      activeSelectionComplete: false,
      disabledService,
      removedGeneratedConfig,
      restartedService: false,
      stoppedService
    };
  }

  return synchronizeRuntimeForSelection(state.activeConnectionName, state.activeProfileName);
}

export async function applyActiveSelection(
  connectionName: string,
  profileName: string
): Promise<ActiveSelectionRuntimeResult> {
  const configPath = await buildGeneratedConfigForSelection(connectionName, profileName);
  const state = await readState();
  state.activeConnectionName = connectionName;
  state.activeProfileName = profileName;
  await writeState(state);
  const restartedService = await restartInstalledServiceIfNeeded();

  return {
    activeSelectionComplete: true,
    configPath,
    disabledService: false,
    removedGeneratedConfig: false,
    restartedService,
    stoppedService: false
  };
}

async function synchronizeRuntimeForSelection(
  connectionName: string,
  profileName: string
): Promise<ActiveSelectionRuntimeResult> {
  const configPath = await buildGeneratedConfigForSelection(connectionName, profileName);
  const restartedService = await restartInstalledServiceIfNeeded();

  return {
    activeSelectionComplete: true,
    configPath,
    disabledService: false,
    removedGeneratedConfig: false,
    restartedService,
    stoppedService: false
  };
}

async function buildGeneratedConfigForSelection(
  connectionName: string,
  profileName: string
): Promise<string> {
  const { buildAndWriteGeneratedConfig } = await import("./sing-box-config.js");
  const { configPath } = await buildAndWriteGeneratedConfig(connectionName, profileName);
  return configPath;
}

async function restartInstalledServiceIfNeeded(): Promise<boolean> {
  const { restartServiceIfInstalled } = await import("./service.js");
  return restartServiceIfInstalled();
}

async function isActiveProfile(profileName: string): Promise<boolean> {
  return (await readState()).activeProfileName === profileName;
}

async function isRuleSetReferencedByActiveProfile(ruleSetName: string): Promise<boolean> {
  const state = await readState();

  if (!state.activeProfileName) {
    return false;
  }

  const activeProfile = await readProfileIfExists(state.activeProfileName);
  return activeProfile?.ruleSetNames.includes(ruleSetName) === true;
}

export async function setProfileRuleSets(profileName: string, ruleSetNames: string[]): Promise<string[]> {
  const profile = await readProfile(profileName);

  if (profile.builtIn) {
    throw new FriendlyMessageError(`Profile "${profileName}" is built in and cannot be changed.`);
  }

  const normalizedNames = Array.from(new Set(ruleSetNames.map((name) => normalizeRuleSetName(name))));

  for (const name of normalizedNames) {
    const ruleSet = await readRuleSetIfExists(name);

    if (!ruleSet) {
      throw new FriendlyMessageError(`Rule set "${name}" does not exist.`);
    }
  }

  profile.ruleSetNames = normalizedNames;
  await writeJson(getProfilePath(profileName), profile);

  if (await isActiveProfile(profileName)) {
    await rebuildGeneratedConfigForActiveSelection();
  }

  return normalizedNames;
}

export async function addRulesToRuleSet(ruleSetName: string, rawInput: string): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const rules = parseRuleEntries(rawInput);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSetName);

  if (rules.length === 0) {
    return [];
  }

  const existingRules = new Set(ruleSet.rules);
  const addedRules = rules.filter((rule) => !existingRules.has(rule));
  const nextRules = Array.from(new Set([...ruleSet.rules, ...rules]));
  ruleSet.rules = nextRules;
  await writeRuleSet(ruleSetName, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection();
  }

  return addedRules;
}

export async function setRulesForRuleSet(ruleSetName: string, rawInput: string): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const rules = parseRuleEntries(rawInput);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSetName);
  ruleSet.rules = rules;
  await writeRuleSet(ruleSetName, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection();
  }

  return rules;
}

export async function removeRulesFromRuleSet(ruleSetName: string, rules: string[]): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSetName);

  if (rules.length === 0) {
    return [];
  }

  const rulesToRemove = new Set(rules);
  const removedRules = ruleSet.rules.filter((rule) => rulesToRemove.has(rule));

  if (removedRules.length === 0) {
    return [];
  }

  ruleSet.rules = ruleSet.rules.filter((rule) => !rulesToRemove.has(rule));
  await writeRuleSet(ruleSetName, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection();
  }

  return removedRules;
}

function normalizeConnectionName(name: string): string {
  const normalized = sanitizeName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Connection name cannot be empty.");
  }

  return normalized;
}

function normalizeProfileName(name: string): string {
  const normalized = sanitizeName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Profile name cannot be empty.");
  }

  return normalized;
}

function normalizeRuleSetName(name: string): string {
  const normalized = sanitizeName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Rule set name cannot be empty.");
  }

  return normalized;
}

function sanitizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function parseRuleEntries(rawInput: string): string[] {
  const entries = Array.from(
    new Set(
      rawInput
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );

  for (const entry of entries) {
    validateRuleEntry(entry);
  }

  return entries;
}

function validateRuleEntry(entry: string): void {
  const match = entry.match(/^([a-z_]+)\s*:\s*(.+)$/u);

  if (!match) {
    throw new FriendlyMessageError(
      `Unsupported rule "${entry}". Use domain:, domain_suffix:, or ip_cidr:.`
    );
  }

  const [, kind, rawValue] = match;
  const value = rawValue.trim();

  if (value.length === 0) {
    throw new FriendlyMessageError(`Rule "${entry}" is missing a value.`);
  }

  if (kind !== "domain" && kind !== "domain_suffix" && kind !== "ip_cidr") {
    throw new FriendlyMessageError(
      `Unsupported rule type "${kind}". Use domain, domain_suffix, or ip_cidr.`
    );
  }
}

async function readProfile(name: string): Promise<ProfileRecord> {
  const builtInProfile = getBuiltInProfile(name);

  if (builtInProfile) {
    return builtInProfile;
  }

  const profile = await readProfileIfExists(name);

  if (!profile) {
    throw new FriendlyMessageError(`Profile "${name}" does not exist.`);
  }

  return profile;
}

async function readRuleSet(name: string): Promise<RuleSetRecord> {
  const ruleSet = await readRuleSetIfExists(name);

  if (!ruleSet) {
    throw new FriendlyMessageError(`Rule set "${name}" does not exist.`);
  }

  return ruleSet;
}

async function readConnectionIfExists(name: string): Promise<ConnectionRecord | undefined> {
  try {
    return await readJson<ConnectionRecord>(getConnectionPath(name));
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readProfileIfExists(name: string): Promise<ProfileRecord | undefined> {
  const builtInProfile = getBuiltInProfile(name);

  if (builtInProfile) {
    return builtInProfile;
  }

  try {
    const profile = await readJson<ProfileRecord>(getProfilePath(name));
    return validateProfileRecord(profile, name);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readRuleSetIfExists(name: string): Promise<RuleSetRecord | undefined> {
  try {
    const ruleSet = await readJson<StoredRuleSetRecord>(getRuleSetPath(name));
    return validateRuleSetRecord(ruleSet, name);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

function validateProfileRecord(profile: ProfileRecord, profileName: string): ProfileRecord {
  if (!Array.isArray(profile.ruleSetNames)) {
    throw new FriendlyMessageError(
      `Profile "${profileName}" uses an outdated file format. Recreate it for the new rule set model.`
    );
  }

  return profile;
}

function getBuiltInProfile(name: string): ProfileRecord | undefined {
  return BUILT_IN_PROFILES.find((profile) => profile.name === name);
}

function isBuiltInProfileName(name: string): boolean {
  return getBuiltInProfile(name) !== undefined;
}

function validateRuleSetRecord(ruleSet: StoredRuleSetRecord, ruleSetName: string): RuleSetRecord {
  if (!Array.isArray(ruleSet.rules)) {
    throw new FriendlyMessageError(`Rule set "${ruleSetName}" has an invalid file format.`);
  }

  for (const rule of ruleSet.rules) {
    if (typeof rule !== "string") {
      throw new FriendlyMessageError(`Rule set "${ruleSetName}" has an invalid file format.`);
    }

    validateRuleEntry(rule);
  }

  return {
    name: ruleSetName,
    rules: ruleSet.rules
  };
}

function compareProfilesForDisplay(left: ProfileRecord, right: ProfileRecord): number {
  if (left.builtIn && !right.builtIn) {
    return 1;
  }

  if (!left.builtIn && right.builtIn) {
    return -1;
  }

  return left.name.localeCompare(right.name);
}

async function readState(): Promise<AppState> {
  try {
    return await readJson<AppState>(getStatePath());
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw error;
  }
}

async function writeState(state: AppState): Promise<void> {
  await ensureDataDirectories();
  await writeJson(getStatePath(), state);
}

async function invalidateGeneratedConfigAndStopServiceIfNeeded(): Promise<{
  disabledService: boolean;
  removedGeneratedConfig: boolean;
  restartedService: boolean;
  stoppedService: boolean;
}> {
  const disabledService = await disableInstalledServiceIfNeeded();
  const stoppedService = await stopInstalledServiceIfNeeded();
  const removedGeneratedConfig = await removeGeneratedConfigIfExists();

  return {
    disabledService,
    removedGeneratedConfig,
    restartedService: false,
    stoppedService
  };
}

async function disableInstalledServiceIfNeeded(): Promise<boolean> {
  const { disableServiceIfInstalled } = await import("./service.js");
  return disableServiceIfInstalled();
}

async function stopInstalledServiceIfNeeded(): Promise<boolean> {
  const { stopServiceIfInstalled } = await import("./service.js");
  return stopServiceIfInstalled();
}

async function removeGeneratedConfigIfExists(): Promise<boolean> {
  const configPath = getGeneratedConfigPath();

  try {
    await access(configPath);
  } catch {
    return false;
  }

  await rm(configPath, { force: true });
  return true;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeRuleSet(name: string, rules: string[]): Promise<void> {
  await writeJson(getRuleSetPath(name), { rules } satisfies StoredRuleSetRecord);
}

async function readJsonFileNames(directoryPath: string): Promise<string[]> {
  return (await readdir(directoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .sort((left, right) => left.localeCompare(right));
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
