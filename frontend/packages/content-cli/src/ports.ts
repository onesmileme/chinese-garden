import type {
  CreateReleaseRequest,
  RegisterReleaseRequest,
  ReleaseArtifactRegistration,
  ReleaseSnapshotResponse,
  ReleaseStatus,
} from "./model";

export interface FileSystemPort {
  readFile(path: string): Promise<Uint8Array>;
  readJsonDir(dir: string): Promise<{ name: string; json: unknown }[]>;
  exists(path: string): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
}

export interface ObjectStoragePort {
  upload(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

export interface BackendAdminPort {
  register(request: RegisterReleaseRequest, actor: string): Promise<void>;
  transition(
    version: string,
    toStatus: ReleaseStatus,
    actor: string,
  ): Promise<void>;
}

export interface LeveledBackendAdminPort extends BackendAdminPort {
  createSnapshot(
    request: CreateReleaseRequest,
    actor: string,
  ): Promise<ReleaseSnapshotResponse>;
  snapshot(version: string): Promise<ReleaseSnapshotResponse>;
  registerArtifacts(
    version: string,
    artifacts: readonly ReleaseArtifactRegistration[],
    actor: string,
  ): Promise<void>;
}

export interface Runner {
  exec(
    command: string,
    args: string[],
    cwd: string,
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
