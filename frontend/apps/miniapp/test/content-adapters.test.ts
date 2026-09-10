import { describe, expect, it, vi } from "vitest";
import type { LeveledManifest } from "@cc/content-schema";
import {
  createMiniappContentDeps,
  type MiniappRuntime,
} from "../src/content/adapters";
import { resolveMiniappRuntimeContentConfig } from "../src/content/config";

const manifest: LeveledManifest = {
  version: "corpus-v6",
  abilityLevel: 2,
  artifactUrl: "https://cdn.test/l2.tar.gz",
  sha256: "a".repeat(64),
  fileSize: 3,
  format: "tar+gzip",
  minClientVersion: "1.0.0",
  contentLevelRuleVersion: "content-level-v1",
  masteryRuleVersion: "mastery-v1",
  progressionRuleVersion: "progression-v1",
};

function runtime() {
  const storage = new Map<string, unknown>();
  const files = new Map<string, Uint8Array>([
    ["/tmp/download", new Uint8Array([1, 2, 3])],
  ]);
  const api: MiniappRuntime = {
    userDataPath: "/user",
    now: () => 100,
    login: vi.fn(async () => ({ code: "code-1" })),
    request: vi.fn(async ({ url }) => ({
      statusCode: 200,
      data: url.endsWith("/v1/auth/platform-login")
        ? {
            accessToken: "access",
            refreshToken: "refresh",
            principalId: "principal-1",
            defaultChildId: "child-1",
          }
        : manifest,
    })),
    downloadFile: vi.fn(async () => ({
      statusCode: 200,
      tempFilePath: "/tmp/download",
    })),
    getStorage: async (key) => storage.get(key) ?? null,
    setStorage: async (key, value) => void storage.set(key, value),
    removeStorage: async (key) => void storage.delete(key),
    getStorageSync: (key) => storage.get(key) ?? null,
    setStorageSync: (key, value) => void storage.set(key, value),
    ensureDirectory: vi.fn(async () => undefined),
    readFile: vi.fn(async (path) => {
      const value = files.get(path);
      if (!value) throw new Error("missing file");
      return value;
    }),
    writeFile: vi.fn(async (path, bytes) => void files.set(path, bytes)),
    renameFile: vi.fn(async (from, to) => {
      const value = files.get(from);
      if (!value) throw new Error("missing source");
      files.set(to, value);
      files.delete(from);
    }),
    removeFile: vi.fn(async (path) => void files.delete(path)),
  };
  return { api, storage, files };
}

describe("miniapp runtime content adapters", () => {
  it("rejects blank production configuration", () => {
    expect(() =>
      resolveMiniappRuntimeContentConfig({}, "weapp", true),
    ).toThrow("runtime content configuration is incomplete");
  });

  it("logs in once, persists credentials, and requests the child manifest", async () => {
    const { api } = runtime();
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );

    await expect(deps.auth.session()).resolves.toEqual({
      childProfileId: "child-1",
    });
    await expect(deps.auth.session()).resolves.toEqual({
      childProfileId: "child-1",
    });
    await expect(deps.manifests.manifest("child-1")).resolves.toEqual(manifest);
    expect(api.login).toHaveBeenCalledOnce();
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access" }),
      }),
    );
  });

  it("downloads bytes through a temporary file and always removes it", async () => {
    const { api } = runtime();
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );

    await expect(deps.binary.download(manifest.artifactUrl)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(api.downloadFile).toHaveBeenCalledWith(manifest.artifactUrl);
    expect(api.removeFile).toHaveBeenCalledWith("/tmp/download");
  });

  it("removes a failed download and reports its status", async () => {
    const { api } = runtime();
    vi.mocked(api.downloadFile).mockResolvedValue({
      statusCode: 503,
      tempFilePath: "/tmp/failed",
    });
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );

    await expect(deps.binary.download(manifest.artifactUrl)).rejects.toThrow(
      "content download failed: 503",
    );
    expect(api.removeFile).toHaveBeenCalledWith("/tmp/failed");
  });

  it("shares one refresh across concurrent unauthorized manifest requests", async () => {
    const { api, storage } = runtime();
    storage.set("cc_auth_session_v1", {
      accessToken: "expired",
      refreshToken: "refresh",
      principalId: "principal-1",
      defaultChildId: "child-1",
    });
    vi.mocked(api.request).mockImplementation(async ({ url, headers }) => {
      if (url.endsWith("/v1/auth/refresh")) {
        await Promise.resolve();
        return {
          statusCode: 200,
          data: {
            accessToken: "renewed",
            refreshToken: "next-refresh",
            principalId: "principal-1",
            defaultChildId: "child-1",
          },
        };
      }
      return headers.Authorization === "Bearer renewed"
        ? { statusCode: 200, data: manifest }
        : { statusCode: 401, data: {} };
    });
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );

    await expect(
      Promise.all([
        deps.manifests.manifest("child-1"),
        deps.manifests.manifest("child-1"),
      ]),
    ).resolves.toEqual([manifest, manifest]);
    expect(
      vi
        .mocked(api.request)
        .mock.calls.filter(([request]) =>
          request.url.endsWith("/v1/auth/refresh"),
        ),
    ).toHaveLength(1);
  });

  it("atomically writes, reads, orders, and removes child-scoped cache files", async () => {
    const { api, files } = runtime();
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );
    const record = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([1, 2, 3]),
    };
    const key = {
      childProfileId: "child-1",
      version: manifest.version,
      abilityLevel: manifest.abilityLevel,
      sha256: manifest.sha256,
    };

    await deps.cache.write(record);
    await expect(deps.cache.readExact(key)).resolves.toEqual(record);
    await expect(
      deps.cache.readPinned("child-1", {
        version: manifest.version,
        abilityLevel: manifest.abilityLevel,
      }),
    ).resolves.toEqual(record);
    await expect(
      deps.cache.readPinned("child-1", {
        version: manifest.version,
        abilityLevel: 1,
      }),
    ).resolves.toBeNull();
    await expect(deps.cache.readLatest("other-child")).resolves.toBeNull();
    expect(api.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      record.bytes,
    );
    expect(api.renameFile).toHaveBeenCalledOnce();

    await deps.cache.remove(key);
    await expect(deps.cache.readExact(key)).resolves.toBeNull();
    expect([...files.keys()]).toEqual(["/tmp/download"]);
  });

  it("drops cache metadata when the referenced file is missing", async () => {
    const { api, storage, files } = runtime();
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );
    const record = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([1, 2, 3]),
    };
    const key = {
      childProfileId: "child-1",
      version: manifest.version,
      abilityLevel: manifest.abilityLevel,
      sha256: manifest.sha256,
    };
    await deps.cache.write(record);
    for (const path of files.keys()) {
      if (path.startsWith("/user/")) files.delete(path);
    }

    await expect(deps.cache.readExact(key)).resolves.toBeNull();
    expect(storage.get("cc_content_cache_index_v2")).toEqual({});
  });

  it("computes a portable SHA-256 digest", async () => {
    const { api } = runtime();
    const deps = createMiniappContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "wx-app",
        clientVersion: "1.0.0",
      },
      api,
    );

    await expect(
      deps.hash.sha256(new TextEncoder().encode("abc")),
    ).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
