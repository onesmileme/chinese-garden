import { describe, expect, it, vi } from "vitest";
import {
  asKnowledgePointId,
  type LeveledManifest,
} from "@cc/content-schema";
import {
  createContentLoader,
  isContentSelection,
  type ContentLoaderDeps,
  type RuntimeCorpus,
} from "../src/content/content-loader";

const manifest: LeveledManifest = {
  version: "corpus-v6",
  abilityLevel: 2,
  artifactUrl: "https://cdn.test/L2.tar.gz",
  sha256: "a".repeat(64),
  fileSize: 3,
  format: "tar+gzip",
  minClientVersion: "1.0.0",
  contentLevelRuleVersion: "content-level-v1",
  masteryRuleVersion: "mastery-v1",
  progressionRuleVersion: "progression-v1",
};

const corpus: RuntimeCorpus = { characters: [], poems: [], idioms: [] };

describe("isContentSelection", () => {
  const valid = {
    childProfileId: "child-1",
    authentication: "AUTHENTICATED",
    version: "corpus-v6",
    abilityLevel: 2,
  };

  it.each([
    null,
    "selection",
    { ...valid, childProfileId: 1 },
    { ...valid, childProfileId: "" },
    { ...valid, authentication: "UNKNOWN" },
    { ...valid, version: 1 },
    { ...valid, version: "" },
    { ...valid, abilityLevel: "2" },
    { ...valid, abilityLevel: 1.5 },
    { ...valid, abilityLevel: 0 },
    { ...valid, abilityLevel: 6 },
  ])("rejects an invalid content selection", (selection) => {
    expect(isContentSelection(selection)).toBe(false);
  });

  it.each(["AUTHENTICATED", "GUEST"] as const)(
    "accepts %s content",
    (authentication) => {
      expect(isContentSelection({ ...valid, authentication })).toBe(true);
    },
  );
});

function deps(overrides: Partial<ContentLoaderDeps> = {}): ContentLoaderDeps {
  return {
    auth: { session: vi.fn(async () => ({ childProfileId: "child-1" })) },
    manifests: { manifest: vi.fn(async () => manifest) },
    binary: { download: vi.fn(async () => new Uint8Array([1, 2, 3])) },
    hash: { sha256: vi.fn(async () => "a".repeat(64)) },
    decoder: { decode: vi.fn(async () => corpus) },
    cache: {
      readExact: vi.fn(async () => null),
      readPinned: vi.fn(async () => null),
      readLatest: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    bundled: { load: vi.fn(() => corpus) },
    guestIdentity: {
      getOrCreateChildId: vi.fn(async () => "guest-child"),
    },
    clientVersion: { current: () => "1.0.0" },
    diagnostics: { record: vi.fn() },
    ...overrides,
  };
}

describe("createContentLoader", () => {
  it("downloads, verifies, caches, and returns remote content", async () => {
    const ports = deps();

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("REMOTE");
    expect(loaded.childProfileId).toBe("child-1");
    expect(loaded.authentication).toBe("AUTHENTICATED");
    expect(ports.cache.write).toHaveBeenCalledOnce();
  });

  it("uses the latest verified child cache when the network fails", async () => {
    const cached = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([1, 2, 3]),
    };
    const ports = deps({
      manifests: {
        manifest: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
      cache: {
        readExact: vi.fn(async () => null),
        readLatest: vi.fn(async () => cached),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("CACHE");
    expect(loaded.manifest.version).toBe("corpus-v6");
  });

  it("uses bundled L1 with a stable guest child when login fails", async () => {
    const ports = deps({
      auth: {
        session: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(loaded.authentication).toBe("GUEST");
    expect(loaded.childProfileId).toBe("guest-child");
    expect(loaded.manifest.abilityLevel).toBe(1);
  });

  it("uses bundled L1 for an authenticated child when the manifest is unavailable", async () => {
    const ports = deps({
      manifests: {
        manifest: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.authentication).toBe("AUTHENTICATED");
    expect(loaded.childProfileId).toBe("child-1");
    expect(loaded.manifest.abilityLevel).toBe(1);
  });

  it("never caches a download with the wrong hash", async () => {
    const ports = deps({
      hash: { sha256: vi.fn(async () => "b".repeat(64)) },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(ports.cache.write).not.toHaveBeenCalled();
  });

  it("rejects a download with the wrong size before hashing", async () => {
    const ports = deps({
      binary: { download: vi.fn(async () => new Uint8Array([1, 2])) },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(ports.hash.sha256).not.toHaveBeenCalled();
  });

  it("removes a corrupt exact cache entry and downloads a replacement", async () => {
    const corrupt = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([9, 9, 9]),
    };
    const ports = deps({
      hash: {
        sha256: vi
          .fn()
          .mockResolvedValueOnce("b".repeat(64))
          .mockResolvedValueOnce("a".repeat(64)),
      },
      cache: {
        readExact: vi.fn(async () => corrupt),
        readLatest: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("REMOTE");
    expect(ports.cache.remove).toHaveBeenCalledOnce();
    expect(ports.binary.download).toHaveBeenCalledOnce();
  });

  it("does not restore a cached level above the latest trusted manifest", async () => {
    const highManifest = { ...manifest, abilityLevel: 4 as const };
    const ports = deps({
      binary: {
        download: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
      cache: {
        readExact: vi.fn(async () => null),
        readLatest: vi.fn(async () => ({
          childProfileId: "child-1",
          manifest: highManifest,
          bytes: new Uint8Array([1, 2, 3]),
        })),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(loaded.manifest.abilityLevel).toBe(2);
  });

  it("uses an exact verified cache without downloading", async () => {
    const cached = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([1, 2, 3]),
    };
    const ports = deps({
      cache: {
        readExact: vi.fn(async () => cached),
        readLatest: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).refreshAfterSession();

    expect(loaded.source).toBe("CACHE");
    expect(ports.binary.download).not.toHaveBeenCalled();
  });

  it("restores a version-pinned session from its verified cache", async () => {
    const pinned = {
      childProfileId: "child-1",
      manifest,
      bytes: new Uint8Array([1, 2, 3]),
    };
    const ports = deps({
      cache: {
        readExact: vi.fn(async () => null),
        readPinned: vi.fn(async () => pinned),
        readLatest: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load({
      childProfileId: "child-1",
      authentication: "AUTHENTICATED",
      version: "corpus-v6",
      abilityLevel: 2,
    });

    expect(loaded.source).toBe("CACHE");
    expect(loaded.manifest).toEqual(manifest);
    expect(ports.auth.session).not.toHaveBeenCalled();
    expect(ports.manifests.manifest).not.toHaveBeenCalled();
    expect(ports.binary.download).not.toHaveBeenCalled();
  });

  it("restores a bundled version-pinned session without cache access", async () => {
    const ports = deps();

    const loaded = await createContentLoader(ports).load({
      childProfileId: "guest-1",
      authentication: "GUEST",
      version: "bundled-corpus-v5-L1",
      abilityLevel: 1,
    });

    expect(loaded).toMatchObject({
      childProfileId: "guest-1",
      authentication: "GUEST",
      source: "BUNDLED",
      manifest: { version: "bundled-corpus-v5-L1", abilityLevel: 1 },
    });
    expect(ports.cache.readPinned).not.toHaveBeenCalled();
  });

  it("rejects a version-pinned session when its cache is unavailable", async () => {
    const ports = deps();

    await expect(
      createContentLoader(ports).load({
        childProfileId: "child-1",
        authentication: "AUTHENTICATED",
        version: "corpus-v5",
        abilityLevel: 2,
      }),
    ).rejects.toThrow("version-pinned content cache is unavailable");

    expect(ports.diagnostics.record).toHaveBeenCalledOnce();
    expect(ports.cache.remove).not.toHaveBeenCalled();
  });

  it.each([
    { version: "corpus-v5", abilityLevel: 2 as const },
    { version: "corpus-v6", abilityLevel: 1 as const },
  ])("rejects a pinned cache that does not match $version L$abilityLevel", async (selection) => {
    const ports = deps({
      cache: {
        readExact: vi.fn(async () => null),
        readPinned: vi.fn(async () => ({
          childProfileId: "child-1",
          manifest,
          bytes: new Uint8Array([1, 2, 3]),
        })),
        readLatest: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    await expect(
      createContentLoader(ports).load({
        childProfileId: "child-1",
        authentication: "AUTHENTICATED",
        ...selection,
      }),
    ).rejects.toThrow("content cache does not match session pin");

    expect(ports.cache.remove).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "another child",
      record: { childProfileId: "child-2", manifest },
    },
    {
      name: "another version",
      record: {
        childProfileId: "child-1",
        manifest: { ...manifest, version: "corpus-v5" },
      },
    },
    {
      name: "another level",
      record: {
        childProfileId: "child-1",
        manifest: { ...manifest, abilityLevel: 1 as const },
      },
    },
    {
      name: "another digest",
      record: {
        childProfileId: "child-1",
        manifest: { ...manifest, sha256: "b".repeat(64) },
      },
    },
  ])("replaces an exact cache entry for $name", async ({ record }) => {
    const ports = deps({
      cache: {
        readExact: vi.fn(async () => ({
          ...record,
          bytes: new Uint8Array([1, 2, 3]),
        })),
        readLatest: vi.fn(async () => null),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("REMOTE");
    expect(ports.cache.remove).toHaveBeenCalledOnce();
  });

  it("loads a corpus that omits the optional character bank", async () => {
    // 古文乐园默认无字库：decode 可返回不含 characters 的语料，仍须校验并缓存。
    const poemOnly: RuntimeCorpus = {
      poems: [
        {
          id: asKnowledgePointId("sc-1"),
          title: "静夜思",
          author: "李白",
          lines: ["床前明月光"],
          difficulty: 1,
          level: 1,
          promotionRequired: true,
          status: "ACTIVE",
          tags: [],
          revision: 1,
        },
      ],
      idioms: [],
    };
    const ports = deps({
      decoder: { decode: vi.fn(async () => poemOnly) },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("REMOTE");
    expect(loaded.corpus.characters).toBeUndefined();
    expect(ports.cache.write).toHaveBeenCalledOnce();
  });

  it("rejects incompatible cached and remote artifacts", async () => {
    const incompatible = { ...manifest, minClientVersion: "2.0.0" };
    const ports = deps({
      manifests: { manifest: vi.fn(async () => incompatible) },
      cache: {
        readExact: vi.fn(async () => null),
        readLatest: vi.fn(async () => ({
          childProfileId: "child-1",
          manifest: incompatible,
          bytes: new Uint8Array([1, 2, 3]),
        })),
        write: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(ports.binary.download).not.toHaveBeenCalled();
    expect(ports.cache.remove).toHaveBeenCalledOnce();
  });

  it.each([
    { status: "ARCHIVED" as const, level: 1 as const },
    { status: "ACTIVE" as const, level: 3 as const },
  ])("rejects corpus items outside the manifest contract", async (item) => {
    const invalidCorpus: RuntimeCorpus = {
      characters: [
        {
          id: asKnowledgePointId("hz-invalid"),
          char: "云",
          pinyin: "yún",
          imageId: "img-yun",
          theme: "nature",
          strokes: 4,
          difficulty: 1,
          promotionRequired: true,
          tags: [],
          revision: 1,
          ...item,
        },
      ],
      poems: [],
      idioms: [],
    };
    const ports = deps({
      decoder: { decode: vi.fn(async () => invalidCorpus) },
    });

    const loaded = await createContentLoader(ports).load();

    expect(loaded.source).toBe("BUNDLED");
    expect(ports.cache.write).not.toHaveBeenCalled();
  });

  it.each([
    ["1", "1.0.0"],
    ["1.0.0", "1"],
  ])("accepts equivalent dotted versions %s and %s", async (current, minimum) => {
    const ports = deps({
      manifests: {
        manifest: vi.fn(async () => ({
          ...manifest,
          minClientVersion: minimum,
        })),
      },
      clientVersion: { current: () => current },
    });

    expect((await createContentLoader(ports).load()).source).toBe("REMOTE");
  });
});
