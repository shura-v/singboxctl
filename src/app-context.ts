export type ServiceManagerInfo = {
  configDirectoryViewerName: string;
  definitionLabel: string;
  definitionPath: string;
  displayName: string;
  label: string;
  privilegePrompt: string;
};

export type ServiceLogsInfo = {
  path: string;
  viewerName: string;
};

export type ServiceStatus = {
  configPath: string;
  installed: boolean;
  loaded: boolean;
  service: ServiceManagerInfo;
};

export type ServiceInstallResult = {
  configPath: string;
  service: ServiceManagerInfo;
};

export interface AppService {
  disableIfInstalled(): Promise<boolean>;
  getInfo(): ServiceManagerInfo;
  getStatus(): Promise<ServiceStatus>;
  install(): Promise<ServiceInstallResult>;
  openConfigDirectory(): Promise<void>;
  restartIfInstalled(): Promise<boolean>;
  stopIfInstalled(): Promise<boolean>;
  uninstall(): Promise<void>;
}

export interface AppLogs {
  clear(): Promise<void>;
  getInfo(): ServiceLogsInfo;
  open(): Promise<void>;
}

export interface DesktopOpener {
  openDirectory(directoryPath: string): Promise<void>;
  openFile(filePath: string): Promise<void>;
  openServiceLogs(logPath: string): Promise<void>;
}

export type ForegroundConnectResult = {
  command: string;
};

export interface AppRunner {
  connect(configPath: string): Promise<ForegroundConnectResult>;
}

export interface AppContext {
  assertRuntimePrerequisitesInstalled(): Promise<void>;
  desktop: DesktopOpener;
  logs: AppLogs;
  runner: AppRunner;
  service: AppService;
}

export type RuntimeDependencies = Pick<AppService, "disableIfInstalled" | "restartIfInstalled" | "stopIfInstalled">;
