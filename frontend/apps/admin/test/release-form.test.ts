import { describe, expect, it } from "vitest";
import {
  nextReleaseStatus,
  toArtifactInputs,
  toCreateReleaseRequest,
  type ArtifactFormRow,
  type CreateReleaseFormData,
} from "../src/release-form";

describe("release form", () => {
  it("returns only the next forward release status", () => {
    expect(nextReleaseStatus("DRAFT")).toBe("VALIDATED");
    expect(nextReleaseStatus("VALIDATED")).toBe("PUBLISHED");
    expect(nextReleaseStatus("PUBLISHED")).toBe("RETIRED");
    expect(nextReleaseStatus("RETIRED")).toBeNull();
  });

  it("normalizes one artifact for each of the five levels", () => {
    const rows: ArtifactFormRow[] = [1, 2, 3, 4, 5].map((level) => ({
      level: level as ArtifactFormRow["level"],
      artifactUrl: ` https://cdn.test/corpus-v8/L${level}.tar.gz `,
      sha256: `${level}`.repeat(64),
      fileSize: `${level * 100}`,
    }));

    expect(toArtifactInputs(rows)).toEqual(
      [1, 2, 3, 4, 5].map((level) => ({
        level,
        artifactUrl: `https://cdn.test/corpus-v8/L${level}.tar.gz`,
        sha256: `${level}`.repeat(64),
        fileSize: level * 100,
        format: "tar+gzip",
      })),
    );
  });

  it("rejects incomplete or invalid artifact registrations", () => {
    const validRows: ArtifactFormRow[] = [1, 2, 3, 4, 5].map((level) => ({
      level: level as ArtifactFormRow["level"],
      artifactUrl: `https://cdn.test/L${level}.tar.gz`,
      sha256: "a".repeat(64),
      fileSize: "100",
    }));

    expect(() => toArtifactInputs(validRows.slice(0, 4))).toThrow(
      "必须登记 L1-L5 五个制品",
    );
    expect(() =>
      toArtifactInputs([
        ...validRows.slice(0, 4),
        { ...validRows[4]!, level: 4 },
      ]),
    ).toThrow("制品等级必须唯一");
    expect(() =>
      toArtifactInputs([
        { ...validRows[0]!, artifactUrl: "http://cdn.test/L1.tar.gz" },
        ...validRows.slice(1),
      ]),
    ).toThrow("制品 URL 必须是绝对 HTTPS 地址");
    expect(() =>
      toArtifactInputs([
        { ...validRows[0]!, artifactUrl: "not-a-url" },
        ...validRows.slice(1),
      ]),
    ).toThrow("制品 URL 必须是绝对 HTTPS 地址");
    expect(() =>
      toArtifactInputs([
        { ...validRows[0]!, sha256: "A".repeat(64) },
        ...validRows.slice(1),
      ]),
    ).toThrow("SHA-256 必须是 64 位小写十六进制");
    expect(() =>
      toArtifactInputs([
        { ...validRows[0]!, fileSize: "0" },
        ...validRows.slice(1),
      ]),
    ).toThrow("文件大小必须是正整数");
    expect(() =>
      toArtifactInputs([
        { ...validRows[0]!, fileSize: "9007199254740992" },
        ...validRows.slice(1),
      ]),
    ).toThrow("文件大小必须是正整数");
  });

  it("normalizes a complete snapshot form", () => {
    const form: CreateReleaseFormData = {
      version: " corpus-v8 ",
      masteryRuleVersion: " mastery-v3 ",
      progressionRuleVersion: " progression-v2 ",
      contentLevelRuleVersion: " level-v4 ",
      minClientVersion: " 2.8.0 ",
    };

    expect(toCreateReleaseRequest(form)).toEqual({
      version: "corpus-v8",
      masteryRuleVersion: "mastery-v3",
      progressionRuleVersion: "progression-v2",
      contentLevelRuleVersion: "level-v4",
      minClientVersion: "2.8.0",
    });
  });

  it("rejects a snapshot form with a blank required field", () => {
    expect(() =>
      toCreateReleaseRequest({
        version: "corpus-v8",
        masteryRuleVersion: " ",
        progressionRuleVersion: "progression-v2",
        contentLevelRuleVersion: "level-v4",
        minClientVersion: "2.8.0",
      }),
    ).toThrow("请填写所有快照字段");
  });
});
