import {
  decodeContentArtifact,
  type ContentCacheKey,
  type ContentCacheRecord,
  type ContentLoaderDeps,
} from "@cc/application";
import {
  createAuthClient,
  createContentClient,
  createRefreshingHttpClient,
  HttpError,
  type AuthSession,
  type AuthSessionStore,
  type HttpClient,
} from "@cc/api-client";
import { challengeContent } from "@cc/content";
import { corpusAtOrBelow } from "@cc/domain";
import {
  resolveBrowserRuntimeContentConfig,
  type RuntimeContentConfig,
} from "./config";

type BrowserStoreName =
  | "credentials"
  | "contentMetadata"
  | "contentBytes";

export interface BrowserContentDatabase {
  get(store: BrowserStoreName, key: string): Promise<unknown | null>;
  put(store: BrowserStoreName, key: string, value: unknown): Promise<void>;
  delete(store: BrowserStoreName, key: string): Promise<void>;
  entries(store: BrowserStoreName): Promise<Array<[string, unknown]>>;
}

export interface BrowserRuntime {
  fetch: typeof globalThis.fetch;
  crypto: Crypto;
  now(): number;
}

interface StoredContentMetadata {
  childProfileId: string;
  manifest: ContentCacheRecord["manifest"];
  savedAt: number;
}

const DATABASE_NAME = "cc-runtime-content";
const DATABASE_VERSION = 1;
const SESSION_KEY = "session";
const GUEST_KEY = "guest-child";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

export function createIndexedDbContentDatabase(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): BrowserContentDatabase {
  if (!factory) {
    const stores = new Map<BrowserStoreName, Map<string, unknown>>();
    const store = (name: BrowserStoreName) => {
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
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        for (const store of [
          "credentials",
          "contentMetadata",
          "contentBytes",
        ] as const) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB open failed"));
    });
    return opening;
  };
  return {
    async get(store, key) {
      const database = await open();
      const transaction = database.transaction(store, "readonly");
      const done = transactionDone(transaction);
      const value = await requestResult(transaction.objectStore(store).get(key));
      await done;
      return value ?? null;
    },
    async put(store, key, value) {
      const database = await open();
      const transaction = database.transaction(store, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(store).put(value, key);
      await done;
    },
    async delete(store, key) {
      const database = await open();
      const transaction = database.transaction(store, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(store).delete(key);
      await done;
    },
    async entries(store) {
      const database = await open();
      const transaction = database.transaction(store, "readonly");
      const done = transactionDone(transaction);
      const objectStore = transaction.objectStore(store);
      const [keys, values] = await Promise.all([
        requestResult(objectStore.getAllKeys()),
        requestResult(objectStore.getAll()),
      ]);
      await done;
      return keys.map((key, index) => [String(key), values[index]]);
    },
  };
}

function createBrowserHttpClient(
  baseUrl: string,
  runtime: BrowserRuntime,
  accessToken: string | null,
): HttpClient {
  const request = async <T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> => {
    const response = await runtime.fetch(`${baseUrl}${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
    if (!response.ok) {
      throw new HttpError(response.status, `request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  };
  return {
    get: (path, headers) => request(path, "GET", undefined, headers),
    post: (path, body, headers) => request(path, "POST", body, headers),
  };
}

function keyOf(key: ContentCacheKey): string {
  return [
    key.childProfileId,
    key.version,
    key.abilityLevel,
    key.sha256,
  ].join("|");
}

function createAuthStore(database: BrowserContentDatabase): AuthSessionStore {
  return {
    read: async () =>
      (await database.get("credentials", SESSION_KEY)) as AuthSession | null,
    write: (session) => database.put("credentials", SESSION_KEY, session),
    clear: () => database.delete("credentials", SESSION_KEY),
  };
}

function createContentCache(
  database: BrowserContentDatabase,
  now: () => number,
): ContentLoaderDeps["cache"] {
  const read = async (serialized: string): Promise<ContentCacheRecord | null> => {
    const metadata = (await database.get(
      "contentMetadata",
      serialized,
    )) as StoredContentMetadata | null;
    if (!metadata) return null;
    const bytes = await database.get("contentBytes", serialized);
    if (!(bytes instanceof Uint8Array)) {
      await Promise.all([
        database.delete("contentMetadata", serialized),
        database.delete("contentBytes", serialized),
      ]);
      return null;
    }
    return {
      childProfileId: metadata.childProfileId,
      manifest: metadata.manifest,
      bytes,
    };
  };
  return {
    readExact: (key) => read(keyOf(key)),
    async readPinned(childProfileId, selection) {
      const candidates = (await database.entries("contentMetadata"))
        .map(([key, value]) => [key, value as StoredContentMetadata] as const)
        .filter(
          ([, value]) =>
            value.childProfileId === childProfileId &&
            value.manifest.version === selection.version &&
            value.manifest.abilityLevel === selection.abilityLevel,
        )
        .sort(([, left], [, right]) => right.savedAt - left.savedAt);
      return candidates[0] ? read(candidates[0][0]) : null;
    },
    async readLatest(childProfileId) {
      const candidates = (await database.entries("contentMetadata"))
        .map(([key, value]) => [key, value as StoredContentMetadata] as const)
        .filter(([, value]) => value.childProfileId === childProfileId)
        .sort(([, left], [, right]) => right.savedAt - left.savedAt);
      return candidates[0] ? read(candidates[0][0]) : null;
    },
    async write(record) {
      const serialized = keyOf({
        childProfileId: record.childProfileId,
        version: record.manifest.version,
        abilityLevel: record.manifest.abilityLevel,
        sha256: record.manifest.sha256,
      });
      await database.put(
        "contentBytes",
        serialized,
        Uint8Array.from(record.bytes),
      );
      try {
        await database.put("contentMetadata", serialized, {
          childProfileId: record.childProfileId,
          manifest: record.manifest,
          savedAt: now(),
        } satisfies StoredContentMetadata);
      } catch (error) {
        await database.delete("contentBytes", serialized);
        throw error;
      }
    },
    async remove(key) {
      const serialized = keyOf(key);
      await Promise.all([
        database.delete("contentMetadata", serialized),
        database.delete("contentBytes", serialized),
      ]);
    },
  };
}

export function createBrowserContentDeps(
  config: RuntimeContentConfig = resolveBrowserRuntimeContentConfig(),
  database: BrowserContentDatabase = createIndexedDbContentDatabase(),
  overrides: Partial<BrowserRuntime> = {},
): ContentLoaderDeps {
  const runtime: BrowserRuntime = {
    fetch: globalThis.fetch.bind(globalThis),
    crypto: globalThis.crypto,
    now: Date.now,
    ...overrides,
  };
  const sessions = createAuthStore(database);
  const publicHttp = createBrowserHttpClient(config.apiBaseUrl, runtime, null);
  const authClient = createAuthClient(publicHttp);
  const authenticatedHttp = createRefreshingHttpClient(
    (accessToken) =>
      createBrowserHttpClient(config.apiBaseUrl, runtime, accessToken),
    sessions,
    (refreshToken) => authClient.refresh(refreshToken),
  );
  return {
    auth: {
      async session() {
        const cached = await sessions.read();
        if (cached) return { childProfileId: cached.defaultChildId };
        if (
          config.apiBaseUrl === "" ||
          config.platformAppId === "" ||
          config.loginCode === ""
        ) {
          throw new Error("runtime content API is not configured");
        }
        const session = await authClient.platformLogin({
          platform: config.platform,
          platformAppId: config.platformAppId,
          code: config.loginCode,
        });
        await sessions.write(session);
        return { childProfileId: session.defaultChildId };
      },
    },
    manifests: createContentClient(authenticatedHttp),
    binary: {
      async download(url) {
        const response = await runtime.fetch(url);
        if (!response.ok) {
          throw new Error(`content download failed: ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      },
    },
    hash: {
      async sha256(bytes) {
        const digest = await runtime.crypto.subtle.digest(
          "SHA-256",
          Uint8Array.from(bytes).buffer,
        );
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      },
    },
    decoder: { decode: decodeContentArtifact },
    cache: createContentCache(database, runtime.now),
    bundled: {
      load: (level) => corpusAtOrBelow(challengeContent.corpus, level),
    },
    guestIdentity: {
      async getOrCreateChildId() {
        const existing = await database.get("credentials", GUEST_KEY);
        if (typeof existing === "string" && existing !== "") return existing;
        const created = `guest-${runtime.now().toString(36)}`;
        await database.put("credentials", GUEST_KEY, created);
        return created;
      },
    },
    clientVersion: { current: () => config.clientVersion },
    diagnostics: {
      record(error) {
        if (
          error instanceof Error &&
          error.message === "runtime content API is not configured"
        ) {
          return;
        }
        console.error("[RuntimeContent]", error);
      },
    },
  };
}
