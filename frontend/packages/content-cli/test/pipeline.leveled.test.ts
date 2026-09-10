import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { nodeFileSystem } from "../src/adapters/node-fs";
import type {
  PublishOptions,
  ReleaseSnapshotItem,
  ReleaseSnapshotResponse,
} from "../src/model";
import { publishLeveled } from "../src/pipeline";
import type {
  LeveledBackendAdminPort,
  Logger,
  ObjectStoragePort,
  Runner,
} from "../src/ports";

const options: PublishOptions = {
  version: "corpus-v5",
  ruleVersion: "mastery-v1",
  contentLevelRuleVersion: "content-level-v1",
  minClientVersion: "1.0.0",
  approvedBy: "publisher-1",
  dryRun: false,
};

describe("publishLeveled", () => {
  it("uploads and registers all five artifacts before publishing", async () => {
    const fixture = deps();

    const outcome = await publishLeveled(fixture.deps, options);

    expect(outcome.ok).toBe(true);
    expect(outcome.artifacts.map(({ level }) => level)).toEqual([1, 2, 3, 4, 5]);
    expect(fixture.storage.upload).toHaveBeenCalledTimes(5);
    expect(fixture.admin.registerArtifacts).toHaveBeenCalledOnce();
    expect(fixture.calls.slice(-3)).toEqual([
      "register-artifacts",
      "transition:VALIDATED",
      "transition:PUBLISHED",
    ]);
  });

  it("rejects an unapproved release before creating a snapshot", async () => {
    const fixture = deps();

    const outcome = await publishLeveled(fixture.deps, {
      ...options,
      approvedBy: " ",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ code: "NOT_APPROVED" }),
    );
    expect(fixture.admin.createSnapshot).not.toHaveBeenCalled();
  });

  it("leaves an invalid snapshot in draft without uploading", async () => {
    const fixture = deps({ snapshot: { ...snapshot(), items: [] } });

    const outcome = await publishLeveled(fixture.deps, options);

    expect(outcome.ok).toBe(false);
    expect(fixture.runner.exec).not.toHaveBeenCalled();
    expect(fixture.storage.upload).not.toHaveBeenCalled();
    expect(fixture.admin.transition).not.toHaveBeenCalled();
  });

  it("does not upload when golden checks fail", async () => {
    const fixture = deps({ goldenExitCode: 1 });

    const outcome = await publishLeveled(fixture.deps, options);

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ code: "GOLDEN_TS_FAILED" }),
    );
    expect(fixture.storage.upload).not.toHaveBeenCalled();
  });

  it("supports a dry run without storage or metadata mutation", async () => {
    const fixture = deps();

    const outcome = await publishLeveled(fixture.deps, {
      ...options,
      dryRun: true,
    });

    expect(outcome).toMatchObject({
      ok: true,
      artifacts: [],
      finalStatus: null,
    });
    expect(fixture.storage.upload).not.toHaveBeenCalled();
    expect(fixture.admin.registerArtifacts).not.toHaveBeenCalled();
  });

  it("does not register partial uploads", async () => {
    const fixture = deps({ failUploadAt: 3 });

    await expect(publishLeveled(fixture.deps, options)).rejects.toThrow(
      "upload failed",
    );

    expect(fixture.storage.upload).toHaveBeenCalledTimes(3);
    expect(fixture.admin.registerArtifacts).not.toHaveBeenCalled();
    expect(fixture.admin.transition).not.toHaveBeenCalled();
  });
});

function deps({
  snapshot: releaseSnapshot = snapshot(),
  goldenExitCode = 0,
  failUploadAt,
}: {
  snapshot?: ReleaseSnapshotResponse;
  goldenExitCode?: number;
  failUploadAt?: number;
} = {}) {
  const calls: string[] = [];
  let uploadCount = 0;
  const storage: ObjectStoragePort = {
    upload: vi.fn(async (key) => {
      uploadCount += 1;
      calls.push(`upload:${key}`);
      if (uploadCount === failUploadAt) throw new Error("upload failed");
      return `https://cdn.test/${key}`;
    }),
  };
  const admin: LeveledBackendAdminPort = {
    register: vi.fn(),
    createSnapshot: vi.fn(async () => releaseSnapshot),
    snapshot: vi.fn(async () => releaseSnapshot),
    registerArtifacts: vi.fn(async () => {
      calls.push("register-artifacts");
    }),
    transition: vi.fn(async (_version, status) => {
      calls.push(`transition:${status}`);
    }),
  };
  const runner: Runner = {
    exec: vi.fn(async () => ({
      code: goldenExitCode,
      stdout: "",
      stderr: goldenExitCode === 0 ? "" : "golden mismatch",
    })),
  };
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    deps: {
      fs: nodeFileSystem,
      storage,
      admin,
      runner,
      logger,
      contentRoot: fileURLToPath(new URL("../../../content", import.meta.url)),
      repoRoot: "/repo",
    },
    calls,
    storage,
    admin,
    runner,
  };
}

function snapshot(): ReleaseSnapshotResponse {
  const contentRoot = fileURLToPath(new URL("../../../content", import.meta.url));
  const readBank = (name: string, field: string): Record<string, unknown>[] =>
    (
      JSON.parse(
        readFileSync(`${contentRoot}/corpus/${name}`, "utf8"),
      ) as Record<string, Record<string, unknown>[]>
    )[field]!;
  const items: ReleaseSnapshotItem[] = [
    ...readBank("character-bank.json", "characters").map((item) =>
      snapshotItem("CHARACTER", item),
    ),
    ...readBank("poem-bank.json", "poems").map((item) =>
      snapshotItem("POEM", item),
    ),
    ...readBank("idiom-bank.json", "idioms").map((item) =>
      snapshotItem("IDIOM", item),
    ),
  ];
  return {
    version: "corpus-v5",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
    contentLevelRuleVersion: "content-level-v1",
    minClientVersion: "1.0.0",
    items,
  };
}

function snapshotItem(
  type: ReleaseSnapshotItem["type"],
  item: Record<string, unknown>,
): ReleaseSnapshotItem {
  const {
    id,
    status,
    revision,
    level,
    difficulty,
    promotionRequired,
    tags,
    ...payload
  } = item;
  return {
    id: id as string,
    type,
    status: status as "ACTIVE",
    revision: revision as number,
    level: level as ReleaseSnapshotItem["level"],
    difficulty: difficulty as ReleaseSnapshotItem["difficulty"],
    promotionRequired: promotionRequired as boolean,
    tags: tags as string[],
    payload,
  };
}
