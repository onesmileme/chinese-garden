import Taro from "@tarojs/taro";
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
  resolveMiniappRuntimeContentConfig,
  type RuntimeContentConfig,
} from "./config";

const SESSION_KEY = "cc_auth_session_v1";
const GUEST_KEY = "cc_guest_child_v1";
const CACHE_INDEX_KEY = "cc_content_cache_index_v2";
const CACHE_DIRECTORY = "cc-content";

interface StoredContentMetadata {
  childProfileId: string;
  manifest: ContentCacheRecord["manifest"];
  filePath: string;
  savedAt: number;
}

interface RuntimeResponse {
  statusCode: number;
  data: unknown;
}

export interface MiniappRuntime {
  userDataPath: string;
  now(): number;
  login(): Promise<{ code: string }>;
  request(input: {
    url: string;
    method: "GET" | "POST" | "PATCH";
    body?: unknown;
    headers: Record<string, string>;
  }): Promise<RuntimeResponse>;
  downloadFile(url: string): Promise<{
    statusCode: number;
    tempFilePath: string;
  }>;
  getStorage(key: string): Promise<unknown | null>;
  setStorage(key: string, value: unknown): Promise<void>;
  removeStorage(key: string): Promise<void>;
  getStorageSync(key: string): unknown | null;
  setStorageSync(key: string, value: unknown): void;
  ensureDirectory(path: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  renameFile(from: string, to: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function callbackOperation(
  invoke: (
    success: () => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<void> {
  return new Promise((resolve, reject) => invoke(resolve, reject));
}

export function createDefaultMiniappRuntime(): MiniappRuntime {
  const fileSystem = () => {
    if (typeof Taro.getFileSystemManager !== "function") {
      throw new Error("miniapp file system is unavailable");
    }
    return Taro.getFileSystemManager();
  };
  const userDataPath = Taro.env?.USER_DATA_PATH ?? "cc-runtime";
  return {
    userDataPath,
    now: Date.now,
    login: () => Taro.login(),
    async request(input) {
      const response = await Taro.request({
        url: input.url,
        method: input.method,
        data: input.body,
        header: input.headers,
      });
      return { statusCode: response.statusCode, data: response.data };
    },
    async downloadFile(url) {
      const response = await Taro.downloadFile({ url });
      return {
        statusCode: response.statusCode,
        tempFilePath: response.tempFilePath,
      };
    },
    async getStorage(key) {
      try {
        return (await Taro.getStorage({ key })).data ?? null;
      } catch {
        return null;
      }
    },
    async setStorage(key, value) {
      await Taro.setStorage({ key, data: value });
    },
    async removeStorage(key) {
      await Taro.removeStorage({ key });
    },
    getStorageSync: (key) => Taro.getStorageSync(key) ?? null,
    setStorageSync: (key, value) => Taro.setStorageSync(key, value),
    ensureDirectory: (path) =>
      callbackOperation((success, fail) =>
        fileSystem().mkdir({ dirPath: path, recursive: true, success, fail }),
      ),
    readFile: (path) =>
      new Promise((resolve, reject) =>
        fileSystem().readFile({
          filePath: path,
          success: ({ data }) =>
            typeof data === "string"
              ? reject(new Error("binary file returned text"))
              : resolve(new Uint8Array(data)),
          fail: reject,
        }),
      ),
    writeFile: (path, bytes) =>
      callbackOperation((success, fail) =>
        fileSystem().writeFile({
          filePath: path,
          data: toArrayBuffer(bytes),
          success,
          fail,
        }),
      ),
    renameFile: (from, to) =>
      callbackOperation((success, fail) =>
        fileSystem().rename({ oldPath: from, newPath: to, success, fail }),
      ),
    removeFile: (path) =>
      callbackOperation((success, fail) =>
        fileSystem().unlink({ filePath: path, success, fail }),
      ),
  };
}

function createMiniappHttpClient(
  baseUrl: string,
  runtime: MiniappRuntime,
  accessToken: string | null,
): HttpClient {
  const request = async <T>(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> => {
    const response = await runtime.request({
      url: `${baseUrl}${path}`,
      method,
      body,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new HttpError(
        response.statusCode,
        `request failed: ${response.statusCode}`,
      );
    }
    return response.data as T;
  };
  return {
    get: (path, headers) => request(path, "GET", undefined, headers),
    post: (path, body, headers) => request(path, "POST", body, headers),
    patch: (path, body, headers) => request(path, "PATCH", body, headers),
  };
}

function createAuthStore(runtime: MiniappRuntime): AuthSessionStore {
  return {
    read: async () =>
      (await runtime.getStorage(SESSION_KEY)) as AuthSession | null,
    write: (session) => runtime.setStorage(SESSION_KEY, session),
    clear: () => runtime.removeStorage(SESSION_KEY),
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

function fileName(key: ContentCacheKey): string {
  return `${encodeURIComponent(keyOf(key))}.tar.gz`;
}

function createContentCache(
  runtime: MiniappRuntime,
): ContentLoaderDeps["cache"] {
  const directory = `${runtime.userDataPath}/${CACHE_DIRECTORY}`;
  const readIndex = async (): Promise<Record<string, StoredContentMetadata>> =>
    ((await runtime.getStorage(CACHE_INDEX_KEY)) as Record<
      string,
      StoredContentMetadata
    > | null) ?? {};
  const read = async (
    metadata: StoredContentMetadata | undefined,
    key: string,
  ): Promise<ContentCacheRecord | null> => {
    if (!metadata) return null;
    try {
      return {
        childProfileId: metadata.childProfileId,
        manifest: metadata.manifest,
        bytes: await runtime.readFile(metadata.filePath),
      };
    } catch {
      const index = await readIndex();
      delete index[key];
      await runtime.setStorage(CACHE_INDEX_KEY, index);
      return null;
    }
  };

  return {
    async readExact(key) {
      const serialized = keyOf(key);
      return read((await readIndex())[serialized], serialized);
    },
    async readPinned(childProfileId, selection) {
      const index = await readIndex();
      const candidates = Object.entries(index)
        .filter(
          ([, record]) =>
            record.childProfileId === childProfileId &&
            record.manifest.version === selection.version &&
            record.manifest.abilityLevel === selection.abilityLevel,
        )
        .sort(([, left], [, right]) => right.savedAt - left.savedAt);
      const pinned = candidates[0];
      return pinned ? read(pinned[1], pinned[0]) : null;
    },
    async readLatest(childProfileId) {
      const index = await readIndex();
      const candidates = Object.entries(index)
        .filter(([, record]) => record.childProfileId === childProfileId)
        .sort(([, left], [, right]) => right.savedAt - left.savedAt);
      const latest = candidates[0];
      return latest ? read(latest[1], latest[0]) : null;
    },
    async write(record) {
      const key: ContentCacheKey = {
        childProfileId: record.childProfileId,
        version: record.manifest.version,
        abilityLevel: record.manifest.abilityLevel,
        sha256: record.manifest.sha256,
      };
      const serialized = keyOf(key);
      const finalPath = `${directory}/${fileName(key)}`;
      const temporaryPath = `${finalPath}.${runtime.now()}.tmp`;
      await runtime.ensureDirectory(directory);
      try {
        await runtime.writeFile(temporaryPath, record.bytes);
        await runtime.removeFile(finalPath).catch(() => undefined);
        await runtime.renameFile(temporaryPath, finalPath);
        const index = await readIndex();
        index[serialized] = {
          childProfileId: record.childProfileId,
          manifest: record.manifest,
          filePath: finalPath,
          savedAt: runtime.now(),
        };
        try {
          await runtime.setStorage(CACHE_INDEX_KEY, index);
        } catch (error) {
          await runtime.removeFile(finalPath).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        await runtime.removeFile(temporaryPath).catch(() => undefined);
        throw error;
      }
    },
    async remove(key) {
      const serialized = keyOf(key);
      const index = await readIndex();
      const metadata = index[serialized];
      delete index[serialized];
      await runtime.setStorage(CACHE_INDEX_KEY, index);
      if (metadata) {
        await runtime.removeFile(metadata.filePath).catch(() => undefined);
      }
    },
  };
}

export function createMiniappContentDeps(
  config: RuntimeContentConfig = resolveMiniappRuntimeContentConfig(),
  runtime: MiniappRuntime = createDefaultMiniappRuntime(),
): ContentLoaderDeps {
  const sessions = createAuthStore(runtime);
  const publicHttp = createMiniappHttpClient(
    config.apiBaseUrl,
    runtime,
    null,
  );
  const authClient = createAuthClient(publicHttp);
  const authenticatedHttp = createRefreshingHttpClient(
    (accessToken) =>
      createMiniappHttpClient(config.apiBaseUrl, runtime, accessToken),
    sessions,
    (refreshToken) => authClient.refresh(refreshToken),
  );
  return {
    auth: {
      async session() {
        const cached = await sessions.read();
        if (cached) return { childProfileId: cached.defaultChildId };
        if (config.apiBaseUrl === "" || config.platformAppId === "") {
          throw new Error("runtime content API is not configured");
        }
        const { code } = await runtime.login();
        const session = await authClient.platformLogin({
          platform: config.platform,
          platformAppId: config.platformAppId,
          code,
        });
        await sessions.write(session);
        return { childProfileId: session.defaultChildId };
      },
    },
    manifests: createContentClient(authenticatedHttp),
    binary: {
      async download(url) {
        const result = await runtime.downloadFile(url);
        if (result.statusCode < 200 || result.statusCode >= 300) {
          await runtime.removeFile(result.tempFilePath).catch(() => undefined);
          throw new Error(`content download failed: ${result.statusCode}`);
        }
        try {
          return await runtime.readFile(result.tempFilePath);
        } finally {
          await runtime.removeFile(result.tempFilePath).catch(() => undefined);
        }
      },
    },
    hash: { sha256: async (bytes) => sha256Hex(bytes) },
    decoder: { decode: decodeContentArtifact },
    cache: createContentCache(runtime),
    bundled: {
      load: (level) => corpusAtOrBelow(challengeContent.corpus, level),
    },
    guestIdentity: {
      async getOrCreateChildId() {
        const existing = runtime.getStorageSync(GUEST_KEY);
        if (typeof existing === "string" && existing !== "") return existing;
        const created = `guest-${runtime.now().toString(36)}`;
        runtime.setStorageSync(GUEST_KEY, created);
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

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(input: Uint8Array): string {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!;
      const right = words[index - 2]!;
      const sigma0 =
        rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 =
        rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] =
        (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const first = (h! + sum1 + choice + constants[index]! + words[index]!) >>> 0;
      const sum0 =
        rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const second = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  return [...hash]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}
