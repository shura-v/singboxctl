import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { FriendlyMessageError } from "./cli.js";

export type ConnectionRecord = {
  name: string;
  uri: string;
};

export type ProfileRecord = {
  domains: string[];
  name: string;
};

type AppState = {
  activeConnectionName?: string;
  activeProfileName?: string;
};

export function getDataDirectoryPath(): string {
  return join(homedir(), ".config", "singboxctl");
}

function getConnectionsDirectoryPath(): string {
  return join(getDataDirectoryPath(), "connections");
}

function getProfilesDirectoryPath(): string {
  return join(getDataDirectoryPath(), "profiles");
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

export async function ensureDataDirectories(): Promise<void> {
  await mkdir(getConnectionsDirectoryPath(), { recursive: true });
  await mkdir(getProfilesDirectoryPath(), { recursive: true });
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

export async function removeConnection(name: string): Promise<void> {
  await rm(getConnectionPath(name), { force: true });

  const state = await readState();

  if (state.activeConnectionName === name) {
    delete state.activeConnectionName;
    await writeState(state);
  }
}

export async function listConnections(): Promise<ConnectionRecord[]> {
  await ensureDataDirectories();
  const names = await readJsonFileNames(getConnectionsDirectoryPath());
  const items = await Promise.all(names.map((name) => readJson<ConnectionRecord>(getConnectionPath(name))));
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

export async function addProfile(name: string): Promise<ProfileRecord> {
  const normalizedName = normalizeProfileName(name);
  const existing = await readProfileIfExists(normalizedName);

  if (existing) {
    throw new FriendlyMessageError(`Profile "${normalizedName}" already exists.`);
  }

  const profile: ProfileRecord = {
    domains: [],
    name: normalizedName
  };

  await ensureDataDirectories();
  await writeJson(getProfilePath(profile.name), profile);
  return profile;
}

export async function removeProfile(name: string): Promise<void> {
  await rm(getProfilePath(name), { force: true });

  const state = await readState();

  if (state.activeProfileName === name) {
    delete state.activeProfileName;
    await writeState(state);
  }
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  await ensureDataDirectories();
  const names = await readJsonFileNames(getProfilesDirectoryPath());
  const items = await Promise.all(names.map((name) => readJson<ProfileRecord>(getProfilePath(name))));
  return items.sort((left, right) => left.name.localeCompare(right.name));
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

  await writeState({
    activeConnectionName: connectionName,
    activeProfileName: profileName
  });
}

export async function clearActiveSelection(): Promise<void> {
  await writeState({});
}

export async function addDomainsToProfile(profileName: string, rawInput: string): Promise<string[]> {
  const profile = await readProfile(profileName);
  const domains = parseDomainEntries(rawInput);

  if (domains.length === 0) {
    return [];
  }

  const existingDomains = new Set(profile.domains);
  const addedDomains = domains.filter((domain) => !existingDomains.has(domain));
  const nextDomains = Array.from(new Set([...profile.domains, ...domains]));
  profile.domains = nextDomains;
  await writeJson(getProfilePath(profileName), profile);
  return addedDomains;
}

export async function removeRulesFromProfile(profileName: string, rules: string[]): Promise<string[]> {
  const profile = await readProfile(profileName);

  if (rules.length === 0) {
    return [];
  }

  const rulesToRemove = new Set(rules);
  const removedRules = profile.domains.filter((rule) => rulesToRemove.has(rule));

  if (removedRules.length === 0) {
    return [];
  }

  profile.domains = profile.domains.filter((rule) => !rulesToRemove.has(rule));
  await writeJson(getProfilePath(profileName), profile);
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

function sanitizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function parseDomainEntries(rawInput: string): string[] {
  return Array.from(
    new Set(
      rawInput
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

async function readProfile(name: string): Promise<ProfileRecord> {
  const profile = await readProfileIfExists(name);

  if (!profile) {
    throw new FriendlyMessageError(`Profile "${name}" does not exist.`);
  }

  return profile;
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
  try {
    return await readJson<ProfileRecord>(getProfilePath(name));
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
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

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
