import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import type { LeveledManifest } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  decodeContentArtifact,
  decodeContentFiles,
} from "../src/content/decode-content";
import { RUNTIME_ARTIFACT_PATHS } from "../src/content/tar-gzip";

const contentRoot = new URL("../../../content/", import.meta.url);

const manifest: LeveledManifest = {
  version: "corpus-v5",
  abilityLevel: 5,
  artifactUrl: "https://cdn.test/L5.tar.gz",
  sha256: "a".repeat(64),
  fileSize: 1,
  format: "tar+gzip",
  minClientVersion: "1.0.0",
  contentLevelRuleVersion: "content-level-v1",
  masteryRuleVersion: "mastery-v1",
  progressionRuleVersion: "progression-v1",
};

describe("decodeContentArtifact", () => {
  it("decodes and validates the runtime artifact", async () => {
    const corpus = await decodeContentArtifact(runtimeArchive(), manifest);

    expect(corpus.characters.length).toBeGreaterThan(0);
    expect(corpus.poems.length).toBeGreaterThan(0);
    expect(corpus.idioms.length).toBeGreaterThan(0);
  });

  it("rejects a mismatched corpus version", async () => {
    await expect(
      decodeContentArtifact(runtimeArchive(), {
        ...manifest,
        version: "corpus-v6",
      }),
    ).rejects.toThrow("artifact content version mismatch");
  });

  it("rejects mismatched rule versions", async () => {
    await expect(
      decodeContentArtifact(runtimeArchive(), {
        ...manifest,
        masteryRuleVersion: "mastery-v2",
      }),
    ).rejects.toThrow("artifact rule version mismatch");
  });

  it("rejects non-object and malformed bank payloads", async () => {
    await expect(
      decodeContentArtifact(
        runtimeArchive({ "corpus/character-bank.json": [] }),
        manifest,
      ),
    ).rejects.toThrow("artifact JSON must be an object");
    await expect(
      decodeContentArtifact(
        runtimeArchive({
          "corpus/character-bank.json": {
            version: "corpus-v5",
            characters: null,
          },
        }),
        manifest,
      ),
    ).rejects.toThrow("artifact field must be an array");
  });

  it("rejects a missing decoded runtime file", () => {
    expect(() => decodeContentFiles(new Map(), manifest)).toThrow(
      "missing artifact path",
    );
  });
});

function runtimeArchive(
  overrides: Record<string, unknown> = {},
): Uint8Array {
  const entries = [...RUNTIME_ARTIFACT_PATHS].map((name) => {
    const value =
      name in overrides
        ? overrides[name]
        : JSON.parse(readFileSync(new URL(name, contentRoot), "utf8"));
    return { name, data: new TextEncoder().encode(JSON.stringify(value)) };
  });
  return gzipSync(tar(entries));
}

function tar(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode(entry.name), 0);
    header.set(
      new TextEncoder().encode(
        `${entry.data.byteLength.toString(8).padStart(11, "0")}\0`,
      ),
      124,
    );
    header[156] = 48;
    chunks.push(header, entry.data);
    const padding = (512 - (entry.data.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
