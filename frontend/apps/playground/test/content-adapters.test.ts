// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeveledManifest } from "@cc/content-schema";
import {
  createBrowserContentDeps,
  type BrowserContentDatabase,
} from "../src/content/adapters";
import { resolveBrowserRuntimeContentConfig } from "../src/content/config";

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

function memoryDatabase(): BrowserContentDatabase {
  const stores = new Map<string, Map<string, unknown>>();
  const store = (name: string) => {
    const existing = stores.get(name);
    if (existing) return existing;
    const created = new Map<string, unknown>();
    stores.set(name, created);
    return created;
  };
  return {
    get: async (name, key) => store(name).get(key) ?? null,
    put: async (name, key, value) => void store(name).set(key, value),
    delete: async (name, key) => void store(name).delete(key),
    entries: async (name) => [...store(name).entries()],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("browser runtime content adapters", () => {
  it("validates production configuration", () => {
    expect(() => resolveBrowserRuntimeContentConfig({}, true)).toThrow(
      "runtime content configuration is incomplete",
    );
  });

  it("preserves downloaded bytes and child-scoped cached records", async () => {
    const database = memoryDatabase();
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/platform-login")) {
        return new Response(
          JSON.stringify({
            accessToken: "access",
            refreshToken: "refresh",
            principalId: "principal-1",
            defaultChildId: "child-1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(Uint8Array.from([0, 127, 128, 255]), {
        status: 200,
      });
    });
    const deps = createBrowserContentDeps(
      {
        apiBaseUrl: "https://api.test",
        platform: "WECHAT",
        platformAppId: "web-app",
        clientVersion: "1.0.0",
        loginCode: "dev-code",
      },
      database,
      { fetch },
    );

    await expect(deps.auth.session()).resolves.toEqual({
      childProfileId: "child-1",
    });
    await expect(deps.binary.download("https://cdn.test/l2")).resolves.toEqual(
      new Uint8Array([0, 127, 128, 255]),
    );

    const record = {
      childProfileId: "child-1",
      manifest: { ...manifest, fileSize: 4 },
      bytes: new Uint8Array([0, 127, 128, 255]),
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
      deps.cache.readPinned("other-child", {
        version: manifest.version,
        abilityLevel: manifest.abilityLevel,
      }),
    ).resolves.toBeNull();
    await expect(deps.cache.readLatest("other-child")).resolves.toBeNull();
    await deps.cache.remove(key);
    await expect(deps.cache.readExact(key)).resolves.toBeNull();
  });

  it("hashes bytes with Web Crypto and keeps a stable guest identity", async () => {
    const database = memoryDatabase();
    const digest = new Uint8Array(32);
    digest[31] = 1;
    const subtle = {
      digest: vi.fn(async () => digest.buffer),
    } as unknown as SubtleCrypto;
    const deps = createBrowserContentDeps(
      {
        apiBaseUrl: "",
        platform: "WECHAT",
        platformAppId: "",
        clientVersion: "0.0.0",
        loginCode: "",
      },
      database,
      {
        fetch: vi.fn(),
        crypto: { subtle } as Crypto,
      },
    );

    await expect(deps.hash.sha256(new Uint8Array([1]))).resolves.toBe(
      `${"00".repeat(31)}01`,
    );
    const first = await deps.guestIdentity.getOrCreateChildId();
    expect(await deps.guestIdentity.getOrCreateChildId()).toBe(first);
  });
});
