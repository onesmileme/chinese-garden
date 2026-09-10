import type { LeveledBackendAdminPort } from "../ports";
import type { ReleaseSnapshotResponse } from "../model";

export interface HttpAdminConfig {
  baseUrl: string;
  token: string;
}

export function createHttpAdminPort(config: HttpAdminConfig): LeveledBackendAdminPort {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  if (baseUrl === "" || config.token === "") {
    throw new Error(
      "CONTENT_ADMIN_BASE_URL and CONTENT_ADMIN_TOKEN are required for publish",
    );
  }

  async function post<T>(
    path: string,
    body: unknown,
    actor: string,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Token": config.token,
        "X-Actor": actor,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`content admin request failed: ${response.status}`);
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }

  async function get<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "X-Admin-Token": config.token },
    });
    if (!response.ok) {
      throw new Error(`content admin request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    async register(registerRequest, actor) {
      await post("/v1/admin/content/releases", registerRequest, actor);
    },
    async createSnapshot(request, actor) {
      return post<ReleaseSnapshotResponse>(
        "/v1/admin/content/releases/snapshots",
        request,
        actor,
      );
    },
    async snapshot(version) {
      return get<ReleaseSnapshotResponse>(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/snapshot`,
      );
    },
    async registerArtifacts(version, artifacts, actor) {
      await post(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/artifacts`,
        { artifacts },
        actor,
      );
    },
    async transition(version, toStatus, actor) {
      await post(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/status`,
        { toStatus },
        actor,
      );
    },
  };
}
