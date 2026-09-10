// @vitest-environment happy-dom
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentSelectionOf,
  createContentLoader,
  createRuntimeContentState,
} from "@cc/application";
import type { LeveledManifest } from "@cc/content-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  packRuntimeBundle,
  type RuntimePackBundle,
} from "../../../packages/content-cli/src";
import {
  createBrowserContentDeps,
  createIndexedDbContentDatabase,
  type BrowserContentDatabase,
} from "../src/content/adapters";

const contentRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../content",
);
const config = {
  apiBaseUrl: "https://api.test",
  platform: "DOUYIN" as const,
  platformAppId: "douyin-app",
  clientVersion: "1.0.0",
  loginCode: "one-time-code",
};

interface RuntimeServer {
  fetch: typeof globalThis.fetch;
  offline(value: boolean): void;
  publish(version: string, abilityLevel: 1 | 2 | 3 | 4 | 5): Promise<void>;
}

function jsonFile(path: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(contentRoot, path), "utf8"),
  ) as Record<string, unknown>;
}

async function artifact(
  version: string,
  abilityLevel: 1 | 2 | 3 | 4 | 5,
) {
  const characterBank = jsonFile("corpus/character-bank.json");
  const firstCharacter = (characterBank.characters as unknown[])[0] as Record<
    string,
    unknown
  >;
  const atOrBelow = (entries: unknown[]) =>
    entries.filter(
      (entry) =>
        (entry as { level: number }).level <= abilityLevel,
    );
  return packRuntimeBundle({
    characterBank: {
      ...characterBank,
      version,
      characters: [
        ...atOrBelow(characterBank.characters as unknown[]),
        {
          ...firstCharacter,
          id: `hz-remote-${version}`,
          char: "远",
          pinyin: "yuǎn",
          imageId: `img-remote-${version}`,
          level: 1,
        },
      ],
    },
    poemBank: {
      ...jsonFile("corpus/poem-bank.json"),
      version,
      poems: atOrBelow(
        jsonFile("corpus/poem-bank.json").poems as unknown[],
      ),
    },
    idiomBank: {
      ...jsonFile("corpus/idiom-bank.json"),
      version,
      idioms: atOrBelow(
        jsonFile("corpus/idiom-bank.json").idioms as unknown[],
      ),
    },
    curriculumMap: jsonFile("curriculum/curriculum-v1.json"),
    contentLevelRules: jsonFile("rules/content-level-v1.json"),
    masteryRules: jsonFile("rules/mastery-v1.json"),
    progressionRules: jsonFile("rules/progression-v1.json"),
    questionsVector: { contentVersion: version, cases: [] },
    testVectors: {},
  } as RuntimePackBundle);
}

function createServer(): RuntimeServer {
  let isOffline = false;
  let manifest: LeveledManifest;
  let bytes: Uint8Array;
  const fetch = vi.fn<typeof globalThis.fetch>(
    async (input, init) => {
      if (isOffline) throw new TypeError("network unavailable");
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === "https://api.test/v1/auth/platform-login") {
        return Response.json({
          accessToken: "access-1",
          refreshToken: "refresh-1",
          principalId: "principal-1",
          defaultChildId: "child-1",
        });
      }
      if (url === "https://api.test/v1/content/manifest") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer access-1",
          "X-Child-Profile-Id": "child-1",
        });
        return Response.json(manifest);
      }
      if (url === manifest.artifactUrl) {
        return new Response(Uint8Array.from(bytes));
      }
      return new Response(null, { status: 404 });
    },
  );
  return {
    fetch,
    offline(value) {
      isOffline = value;
    },
    async publish(version, abilityLevel) {
      const packed = await artifact(version, abilityLevel);
      bytes = packed.bytes;
      manifest = {
        version,
        abilityLevel,
        artifactUrl: `https://cdn.test/${version}/L${abilityLevel}.tar.gz`,
        sha256: packed.sha256,
        fileSize: packed.fileSize,
        format: "tar+gzip",
        minClientVersion: "1.0.0",
        contentLevelRuleVersion: "content-level-v1",
        masteryRuleVersion: "mastery-v1",
        progressionRuleVersion: "progression-v1",
      };
    },
  };
}

function deps(server: RuntimeServer, database: BrowserContentDatabase) {
  return createBrowserContentDeps(config, database, {
    fetch: server.fetch,
    crypto: webcrypto as unknown as Crypto,
    now: () => 1_700_000_000_000,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runtime content delivery", () => {
  it("downloads verified content and restores it from child cache offline", async () => {
    const server = createServer();
    await server.publish("corpus-v6", 5);
    const database = createIndexedDbContentDatabase(undefined);
    const loader = createContentLoader(deps(server, database));

    const remote = await loader.load();
    expect(remote).toMatchObject({
      childProfileId: "child-1",
      authentication: "AUTHENTICATED",
      source: "REMOTE",
      manifest: { version: "corpus-v6", abilityLevel: 5 },
    });
    expect(
      remote.corpus.characters.some(
        (item) => item.id === "hz-remote-corpus-v6",
      ),
    ).toBe(true);

    server.offline(true);
    const cached = await createContentLoader(deps(server, database)).load();
    expect(cached).toMatchObject({
      childProfileId: "child-1",
      source: "CACHE",
      manifest: { version: "corpus-v6", abilityLevel: 5 },
    });
  });

  it("uses bundled L1 on a first offline launch", async () => {
    const server = createServer();
    server.offline(true);
    const database = createIndexedDbContentDatabase(undefined);

    const loaded = await createContentLoader(deps(server, database)).load();

    expect(loaded).toMatchObject({
      authentication: "GUEST",
      source: "BUNDLED",
      manifest: { version: "bundled-corpus-v5-L1", abilityLevel: 1 },
    });
    expect(loaded.corpus.characters.every((item) => item.level <= 1)).toBe(
      true,
    );
  });

  it("stages a new release until the active session becomes idle", async () => {
    const server = createServer();
    const database = createIndexedDbContentDatabase(undefined);
    await server.publish("corpus-v6", 1);
    const loader = createContentLoader(deps(server, database));
    const active = await loader.load();
    const runtime = createRuntimeContentState(loader, active);

    await server.publish("corpus-v7", 2);
    await runtime.refresh(() => contentSelectionOf(active));

    expect(runtime.getSnapshot()).toMatchObject({
      content: { manifest: { version: "corpus-v6", abilityLevel: 1 } },
      pending: { manifest: { version: "corpus-v7", abilityLevel: 2 } },
    });
    runtime.activateIfIdle(true);
    expect(runtime.getSnapshot().content.manifest.version).toBe("corpus-v6");

    runtime.activateIfIdle(false);
    expect(runtime.getSnapshot()).toMatchObject({
      content: { manifest: { version: "corpus-v7", abilityLevel: 2 } },
      pending: null,
    });
  });
});
