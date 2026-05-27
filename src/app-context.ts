export type ServiceManagerInfo = {
  configDirectoryViewerName: string;
  definitionLabel: string;
  definitionPath: string;
  displayName: string;
  label: string;
  logPath: string;
  logViewerName: string;
  privilegePrompt: string;
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
  clearLogs(): Promise<void>;
  disableIfInstalled(): Promise<boolean>;
  getInfo(): ServiceManagerInfo;
  getStatus(): Promise<ServiceStatus>;
  install(): Promise<ServiceInstallResult>;
  openConfigDirectory(): Promise<void>;
  openLogs(): Promise<void>;
  restartIfInstalled(): Promise<boolean>;
  stopIfInstalled(): Promise<boolean>;
  uninstall(): Promise<void>;
}

export interface DesktopOpener {
  openDirectory(directoryPath: string): Promise<void>;
  openFile(filePath: string): Promise<void>;
  openServiceLogs(logPath: string): Promise<void>;
}

export interface AppContext {
  assertRuntimePrerequisitesInstalled(): Promise<void>;
  desktop: DesktopOpener;
  service: AppService;
}

export type RuntimeDependencies = Pick<AppService, "disableIfInstalled" | "restartIfInstalled" | "stopIfInstalled">;
