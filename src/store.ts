import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeDependencies } from "./app-context.js";
import { FriendlyMessageError } from "./cli.js";
import { isNaiveConnectionUri, type ConnectionGenerationOptions } from "./connection-uri.js";

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

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic";

type StoredConnectionRecord = {
  uri: string;
};

type StoredProfileRecord = {
  ruleSetNames: string[];
};

type StoredRuleSetRecord = {
  rules: string[];
};

type AppState = {
  activeConnectionName?: string;
  activeProfileName?: string;
  ipv6Enabled?: boolean;
  logLevel?: LogLevel;
  naiveUdpOverTcp?: boolean;
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

export const FULL_TUNNEL_PROFILE_NAME = "All Traffic (built-in)";

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

  const existingName = await findStoredJsonBaseNameCaseInsensitive(getConnectionsDirectoryPath(), normalizedName);

  if (existingName) {
    throw new FriendlyMessageError(`Connection "${normalizedName}" already exists.`);
  }

  const connection: ConnectionRecord = {
    name: normalizedName,
    uri
  };

  await ensureDataDirectories();
  await writeConnection(connection.name, connection.uri);
  return connection;
}

export async function updateConnection(
  currentName: string,
  nextName: string,
  rawUri: string,
  runtimeDependencies: RuntimeDependencies
): Promise<ConnectionRecord> {
  const connection = await getConnection(currentName);
  const normalizedNextName = normalizeConnectionName(nextName);
  const uri = rawUri.trim();

  if (uri.length === 0) {
    throw new FriendlyMessageError("Connection URI cannot be empty.");
  }

  if (normalizedNextName !== currentName) {
    const existingName = await findStoredJsonBaseNameCaseInsensitive(getConnectionsDirectoryPath(), normalizedNextName);

    if (existingName && existingName !== connection.name) {
      throw new FriendlyMessageError(`Connection "${normalizedNextName}" already exists.`);
    }
  }

  const nextConnection: ConnectionRecord = {
    name: normalizedNextName,
    uri
  };

  await ensureDataDirectories();
  const currentPath = getConnectionPath(connection.name);
  const nextPath = getConnectionPath(nextConnection.name);

  if (normalizedNextName === connection.name) {
    await writeConnection(connection.name, nextConnection.uri);
  } else if (currentPath.toLowerCase() === nextPath.toLowerCase()) {
    await writeConnection(connection.name, nextConnection.uri);
    await renameFilePreservingCase(currentPath, nextPath);
  } else {
    await writeConnection(nextConnection.name, nextConnection.uri);
    await rm(currentPath, { force: true });
  }

  const state = await readState();

  if (state.activeConnectionName === connection.name) {
    state.activeConnectionName = normalizedNextName;
    await writeState(state);
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
  }

  return nextConnection;
}

export async function removeConnection(
  name: string,
  runtimeDependencies: RuntimeDependencies
): Promise<RemovalResult> {
  if (!(await hasStoredJsonExact(getConnectionsDirectoryPath(), name))) {
    throw new FriendlyMessageError(`Connection "${name}" does not exist.`);
  }

  await rm(getConnectionPath(name), { force: true });

  const state = await readState();

  if (state.activeConnectionName === name) {
    delete state.activeConnectionName;
    await writeState(state);
    const invalidation = await invalidateGeneratedConfigAndStopServiceIfNeeded(runtimeDependencies);
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
  const items = await Promise.all(names.map((name) => getConnection(name)));
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

  if (isReservedBuiltInProfileName(normalizedName)) {
    throw new FriendlyMessageError(`Profile "${normalizedName}" is reserved for a built-in profile.`);
  }

  const existingName = await findStoredJsonBaseNameCaseInsensitive(getProfilesDirectoryPath(), normalizedName);

  if (existingName) {
    throw new FriendlyMessageError(`Profile "${normalizedName}" already exists.`);
  }

  const profile: ProfileRecord = {
    name: normalizedName,
    ruleSetNames: []
  };

  await ensureDataDirectories();
  await writeProfile(profile.name, profile.ruleSetNames);
  return profile;
}

export async function addRuleSet(name: string): Promise<RuleSetRecord> {
  const normalizedName = normalizeRuleSetName(name);
  const existingName = await findStoredJsonBaseNameCaseInsensitive(getRuleSetsDirectoryPath(), normalizedName);

  if (existingName) {
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
  const existingName = await findStoredJsonBaseNameCaseInsensitive(getRuleSetsDirectoryPath(), normalizedName);

  if (existingName) {
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

export async function removeProfile(
  name: string,
  runtimeDependencies: RuntimeDependencies
): Promise<RemovalResult> {
  if (isBuiltInProfileName(name)) {
    throw new FriendlyMessageError(`Profile "${name}" is built in and cannot be removed.`);
  }

  if (!(await hasStoredJsonExact(getProfilesDirectoryPath(), name))) {
    throw new FriendlyMessageError(`Profile "${name}" does not exist.`);
  }

  await rm(getProfilePath(name), { force: true });

  const state = await readState();

  if (state.activeProfileName === name) {
    delete state.activeProfileName;
    await writeState(state);
    const invalidation = await invalidateGeneratedConfigAndStopServiceIfNeeded(runtimeDependencies);
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

export async function removeRuleSet(
  name: string,
  runtimeDependencies: RuntimeDependencies
): Promise<void> {
  if (!(await hasStoredJsonExact(getRuleSetsDirectoryPath(), name))) {
    throw new FriendlyMessageError(`Rule set "${name}" does not exist.`);
  }

  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(name);
  await rm(getRuleSetPath(name), { force: true });

  const profiles = await listProfiles();

  for (const profile of profiles) {
    if (!profile.ruleSetNames.includes(name)) {
      continue;
    }

    profile.ruleSetNames = profile.ruleSetNames.filter((ruleSetName) => ruleSetName !== name);
    await writeProfile(profile.name, profile.ruleSetNames);
  }

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
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

export async function getNaiveUdpOverTcpEnabled(): Promise<boolean> {
  return (await readState()).naiveUdpOverTcp === true;
}

export async function setActiveSelection(
  connectionName: string,
  profileName: string,
  options: ConnectionGenerationOptions = {}
): Promise<void> {
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
  applyConnectionGenerationOptionsToState(state, connection.uri, options);
  await writeState(state);
}

export async function clearActiveSelection(
  runtimeDependencies: RuntimeDependencies
): Promise<void> {
  const state = await readState();
  delete state.activeConnectionName;
  delete state.activeProfileName;
  await writeState(state);
  await finalizeActiveSelectionRuntime(runtimeDependencies);
}

export async function setServiceIntent(enabled: boolean): Promise<void> {
  const state = await readState();
  state.serviceIntent = enabled;
  await writeState(state);
}

export async function getServiceIntent(): Promise<boolean> {
  return (await readState()).serviceIntent === true;
}

export async function setIpv6Enabled(
  enabled: boolean,
  runtimeDependencies: RuntimeDependencies
): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();
  state.ipv6Enabled = enabled;
  await writeState(state);

  if (!state.activeConnectionName || !state.activeProfileName) {
    return {
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    };
  }

  return rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
}

export async function getIpv6Enabled(): Promise<boolean> {
  return (await readState()).ipv6Enabled === true;
}

export async function setLogLevel(
  level: LogLevel,
  runtimeDependencies: RuntimeDependencies
): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();
  state.logLevel = level;
  await writeState(state);

  if (!state.activeConnectionName || !state.activeProfileName) {
    return {
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    };
  }

  return rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
}

export async function getLogLevel(): Promise<LogLevel> {
  return (await readState()).logLevel ?? "error";
}

export async function rebuildGeneratedConfigForActiveSelection(
  runtimeDependencies: RuntimeDependencies
): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();

  if (!state.activeConnectionName || !state.activeProfileName) {
    return {
      activeSelectionComplete: false,
      disabledService: false,
      removedGeneratedConfig: false,
      restartedService: false,
      stoppedService: false
    };
  }

  return finalizeActiveSelectionRuntime(runtimeDependencies);
}

export async function finalizeActiveSelectionRuntime(
  runtimeDependencies: RuntimeDependencies
): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();

  if (!state.activeConnectionName || !state.activeProfileName) {
    const disabledService = await disableInstalledServiceIfNeeded(runtimeDependencies);
    const stoppedService = await stopInstalledServiceIfNeeded(runtimeDependencies);
    const removedGeneratedConfig = await removeGeneratedConfigIfExists();

    return {
      activeSelectionComplete: false,
      disabledService,
      removedGeneratedConfig,
      restartedService: false,
      stoppedService
    };
  }

  return synchronizeRuntimeForSelection(state.activeConnectionName, state.activeProfileName, runtimeDependencies);
}

export async function applyActiveSelection(
  connectionName: string,
  profileName: string,
  runtimeDependencies: RuntimeDependencies,
  options: ConnectionGenerationOptions = {}
): Promise<ActiveSelectionRuntimeResult> {
  const configPath = await buildGeneratedConfigForSelection(connectionName, profileName, options);
  const state = await readState();
  const connection = await getConnection(connectionName);
  state.activeConnectionName = connectionName;
  state.activeProfileName = profileName;
  applyConnectionGenerationOptionsToState(state, connection.uri, options);
  await writeState(state);
  const restartedService = await restartInstalledServiceIfNeeded(runtimeDependencies);

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
  profileName: string,
  runtimeDependencies: RuntimeDependencies
): Promise<ActiveSelectionRuntimeResult> {
  const state = await readState();
  const configPath = await buildGeneratedConfigForSelection(
    connectionName,
    profileName,
    buildConnectionGenerationOptionsFromState(state)
  );
  const restartedService = await restartInstalledServiceIfNeeded(runtimeDependencies);

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
  profileName: string,
  options: ConnectionGenerationOptions = {}
): Promise<string> {
  const { buildAndWriteGeneratedConfig } = await import("./sing-box-config.js");
  const { configPath } = await buildAndWriteGeneratedConfig(connectionName, profileName, options);
  return configPath;
}

async function restartInstalledServiceIfNeeded(runtimeDependencies: RuntimeDependencies): Promise<boolean> {
  return runtimeDependencies.restartIfInstalled();
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

export async function setProfileRuleSets(
  profileName: string,
  ruleSetNames: string[],
  runtimeDependencies: RuntimeDependencies
): Promise<string[]> {
  const profile = await readProfile(profileName);

  if (profile.builtIn) {
    throw new FriendlyMessageError(`Profile "${profileName}" is built in and cannot be changed.`);
  }

  const uniqueNames = Array.from(new Set(ruleSetNames));

  for (const name of uniqueNames) {
    const ruleSet = await readRuleSetIfExists(name);

    if (!ruleSet) {
      throw new FriendlyMessageError(`Rule set "${name}" does not exist.`);
    }
  }

  profile.ruleSetNames = uniqueNames;
  await writeProfile(profileName, profile.ruleSetNames);

  if (await isActiveProfile(profileName)) {
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
  }

  return uniqueNames;
}

export async function addRulesToRuleSet(
  ruleSetName: string,
  rawInput: string,
  runtimeDependencies: RuntimeDependencies
): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const rules = parseRuleEntries(rawInput);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSet.name);

  if (rules.length === 0) {
    return [];
  }

  const existingRules = new Set(ruleSet.rules);
  const addedRules = rules.filter((rule) => !existingRules.has(rule));
  const nextRules = Array.from(new Set([...ruleSet.rules, ...rules]));
  ruleSet.rules = nextRules;
  await writeRuleSet(ruleSet.name, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
  }

  return addedRules;
}

export async function setRulesForRuleSet(
  ruleSetName: string,
  rawInput: string,
  runtimeDependencies: RuntimeDependencies
): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const rules = parseRuleEntries(rawInput);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSet.name);
  ruleSet.rules = rules;
  await writeRuleSet(ruleSet.name, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
  }

  return rules;
}

export async function removeRulesFromRuleSet(
  ruleSetName: string,
  rules: string[],
  runtimeDependencies: RuntimeDependencies
): Promise<string[]> {
  const ruleSet = await readRuleSet(ruleSetName);
  const affectsActiveSelection = await isRuleSetReferencedByActiveProfile(ruleSet.name);

  if (rules.length === 0) {
    return [];
  }

  const rulesToRemove = new Set(rules);
  const removedRules = ruleSet.rules.filter((rule) => rulesToRemove.has(rule));

  if (removedRules.length === 0) {
    return [];
  }

  ruleSet.rules = ruleSet.rules.filter((rule) => !rulesToRemove.has(rule));
  await writeRuleSet(ruleSet.name, ruleSet.rules);

  if (affectsActiveSelection) {
    await rebuildGeneratedConfigForActiveSelection(runtimeDependencies);
  }

  return removedRules;
}

function normalizeConnectionName(name: string): string {
  const normalized = trimInputName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Connection name cannot be empty.");
  }

  ensureSupportedFileName(normalized, "Connection");
  return normalized;
}

function normalizeProfileName(name: string): string {
  const normalized = trimInputName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Profile name cannot be empty.");
  }

  ensureSupportedFileName(normalized, "Profile");
  return normalized;
}

function normalizeRuleSetName(name: string): string {
  const normalized = trimInputName(name);

  if (normalized.length === 0) {
    throw new FriendlyMessageError("Rule set name cannot be empty.");
  }

  ensureSupportedFileName(normalized, "Rule set");
  return normalized;
}

function trimInputName(value: string): string {
  return value.trim();
}

function ensureSupportedFileName(value: string, entityLabel: "Connection" | "Profile" | "Rule set"): void {
  if (value === "." || value === "..") {
    throw new FriendlyMessageError(`${entityLabel} name cannot be "." or "..".`);
  }

  if (value.includes("/")) {
    throw new FriendlyMessageError(`${entityLabel} name cannot contain "/".`);
  }

  if (value.includes("\0")) {
    throw new FriendlyMessageError(`${entityLabel} name cannot contain the NUL character.`);
  }
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
  const connection = await readStoredJsonExact<StoredConnectionRecord>(getConnectionsDirectoryPath(), name);

  if (!connection) {
    return undefined;
  }

  return validateConnectionRecord(connection, name);
}

async function readProfileIfExists(name: string): Promise<ProfileRecord | undefined> {
  const builtInProfile = getBuiltInProfile(name);

  if (builtInProfile) {
    return builtInProfile;
  }

  const profile = await readStoredJsonExact<StoredProfileRecord>(getProfilesDirectoryPath(), name);

  if (!profile) {
    return undefined;
  }

  return validateProfileRecord(profile, name);
}

async function readRuleSetIfExists(name: string): Promise<RuleSetRecord | undefined> {
  const ruleSet = await readStoredJsonExact<StoredRuleSetRecord>(getRuleSetsDirectoryPath(), name);

  if (!ruleSet) {
    return undefined;
  }

  return validateRuleSetRecord(ruleSet, name);
}

function validateConnectionRecord(
  connection: StoredConnectionRecord,
  connectionName: string
): ConnectionRecord {
  if (typeof connection.uri !== "string") {
    throw new FriendlyMessageError(`Connection "${connectionName}" has an invalid file format.`);
  }

  return {
    name: connectionName,
    uri: connection.uri
  };
}

function validateProfileRecord(profile: StoredProfileRecord, profileName: string): ProfileRecord {
  if (!Array.isArray(profile.ruleSetNames)) {
    throw new FriendlyMessageError(
      `Profile "${profileName}" uses an outdated file format. Recreate it for the new rule set model.`
    );
  }

  return {
    name: profileName,
    ruleSetNames: profile.ruleSetNames
  };
}

function getBuiltInProfile(name: string): ProfileRecord | undefined {
  return BUILT_IN_PROFILES.find((profile) => profile.name === name);
}

function isBuiltInProfileName(name: string): boolean {
  return getBuiltInProfile(name) !== undefined;
}

function isReservedBuiltInProfileName(name: string): boolean {
  return BUILT_IN_PROFILES.some((profile) => profile.name.toLowerCase() === name.toLowerCase());
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

function applyConnectionGenerationOptionsToState(
  state: AppState,
  connectionUri: string,
  options: ConnectionGenerationOptions
): void {
  if (isNaiveConnectionUri(connectionUri)) {
    state.naiveUdpOverTcp = options.naiveUdpOverTcp === true;
    return;
  }

  delete state.naiveUdpOverTcp;
}

function buildConnectionGenerationOptionsFromState(state: AppState): ConnectionGenerationOptions {
  return {
    naiveUdpOverTcp: state.naiveUdpOverTcp === true
  };
}

async function invalidateGeneratedConfigAndStopServiceIfNeeded(runtimeDependencies: RuntimeDependencies): Promise<{
  disabledService: boolean;
  removedGeneratedConfig: boolean;
  restartedService: boolean;
  stoppedService: boolean;
}> {
  const disabledService = await disableInstalledServiceIfNeeded(runtimeDependencies);
  const stoppedService = await stopInstalledServiceIfNeeded(runtimeDependencies);
  const removedGeneratedConfig = await removeGeneratedConfigIfExists();

  return {
    disabledService,
    removedGeneratedConfig,
    restartedService: false,
    stoppedService
  };
}

async function disableInstalledServiceIfNeeded(runtimeDependencies: RuntimeDependencies): Promise<boolean> {
  return runtimeDependencies.disableIfInstalled();
}

async function stopInstalledServiceIfNeeded(runtimeDependencies: RuntimeDependencies): Promise<boolean> {
  return runtimeDependencies.stopIfInstalled();
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

async function readStoredJsonExact<T>(directoryPath: string, name: string): Promise<T | undefined> {
  const exactFileName = await findStoredJsonFileNameExact(directoryPath, name);

  if (!exactFileName) {
    return undefined;
  }

  try {
    return readJson<T>(join(directoryPath, exactFileName));
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function hasStoredJsonExact(directoryPath: string, name: string): Promise<boolean> {
  return (await findStoredJsonFileNameExact(directoryPath, name)) !== undefined;
}

async function writeConnection(name: string, uri: string): Promise<void> {
  await writeJson(getConnectionPath(name), { uri } satisfies StoredConnectionRecord);
}

async function writeProfile(name: string, ruleSetNames: string[]): Promise<void> {
  await writeJson(getProfilePath(name), { ruleSetNames } satisfies StoredProfileRecord);
}

async function writeRuleSet(name: string, rules: string[]): Promise<void> {
  await writeJson(getRuleSetPath(name), { rules } satisfies StoredRuleSetRecord);
}

async function renameFilePreservingCase(currentPath: string, nextPath: string): Promise<void> {
  if (currentPath === nextPath) {
    return;
  }

  const tempPath = `${currentPath}.rename-temp`;
  await rm(tempPath, { force: true });
  await rename(currentPath, tempPath);
  await rename(tempPath, nextPath);
}

async function readJsonFileNames(directoryPath: string): Promise<string[]> {
  return (await readdir(directoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .sort((left, right) => left.localeCompare(right));
}

async function findStoredJsonFileNameExact(directoryPath: string, name: string): Promise<string | undefined> {
  const exactFileName = `${name}.json`;

  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const exactEntry = entries.find((entry) => entry.isFile() && entry.name === exactFileName);

    return exactEntry?.name;
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function findStoredJsonBaseNameCaseInsensitive(
  directoryPath: string,
  name: string
): Promise<string | undefined> {
  const targetFileName = `${name}.json`;
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const matchedEntry = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase() === targetFileName.toLowerCase()
    );

    if (!matchedEntry) {
      return undefined;
    }

    return matchedEntry.name.replace(/\.json$/u, "");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
