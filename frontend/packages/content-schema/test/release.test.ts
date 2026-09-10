import { describe, it, expect } from "vitest";
import {
  contentReleaseManifestSchema,
  leveledManifestSchema,
} from "../src/release";

const manifest = {
  version: "2026.07.0",
  ruleVersion: "mastery-v1",
  sha256: "a".repeat(64),
  fileSize: 1024,
  minClientVersion: "1.0.0",
  status: "PUBLISHED",
};

describe("contentReleaseManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(contentReleaseManifestSchema.parse(manifest).status).toBe(
      "PUBLISHED",
    );
  });
  it("rejects a bad sha256 length", () => {
    expect(() =>
      contentReleaseManifestSchema.parse({ ...manifest, sha256: "abc" }),
    ).toThrow();
  });
  it("rejects a non-positive fileSize", () => {
    expect(() =>
      contentReleaseManifestSchema.parse({ ...manifest, fileSize: 0 }),
    ).toThrow();
  });
  it("rejects an unknown status", () => {
    expect(() =>
      contentReleaseManifestSchema.parse({ ...manifest, status: "LIVE" }),
    ).toThrow();
  });
});

describe("leveledManifestSchema", () => {
  it("accepts a downloadable child-level manifest", () => {
    expect(
      leveledManifestSchema.parse({
        version: "corpus-v6",
        abilityLevel: 3,
        artifactUrl: "https://cdn.test/corpus-v6/L3.tar.gz",
        sha256: "a".repeat(64),
        fileSize: 1024,
        format: "tar+gzip",
        minClientVersion: "1.0.0",
        contentLevelRuleVersion: "content-level-v1",
        masteryRuleVersion: "mastery-v1",
        progressionRuleVersion: "progression-v1",
      }).abilityLevel,
    ).toBe(3);
  });

  it("rejects levels outside L1 through L5", () => {
    expect(() =>
      leveledManifestSchema.parse({
        version: "corpus-v6",
        abilityLevel: 6,
        artifactUrl: "https://cdn.test/corpus-v6/L6.tar.gz",
        sha256: "a".repeat(64),
        fileSize: 1024,
        format: "tar+gzip",
        minClientVersion: "1.0.0",
        contentLevelRuleVersion: "content-level-v1",
        masteryRuleVersion: "mastery-v1",
        progressionRuleVersion: "progression-v1",
      }),
    ).toThrow();
  });
});
