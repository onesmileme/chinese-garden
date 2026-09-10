import { describe, expect, it, vi } from "vitest";
import { publish } from "../src/pipeline";
import type { PublishOptions } from "../src/model";
import type {
  BackendAdminPort,
  FileSystemPort,
  Logger,
  ObjectStoragePort,
  Runner,
} from "../src/ports";

const options: PublishOptions = {
  version: "corpus-v4",
  ruleVersion: "mastery-v1",
  contentLevelRuleVersion: "content-level-v1",
  minClientVersion: "1.0.0",
  approvedBy: "teacher-1",
  dryRun: false,
};

const activeMetadata = {
  level: 1,
  promotionRequired: true,
  status: "ACTIVE",
  tags: [],
  revision: 1,
} as const;

const files: Record<string, unknown> = {
  "content/corpus/character-bank.json": {
    version: "corpus-v4",
    characters: [
      {
        id: "hz-ma-妈",
        char: "妈",
        pinyin: "mā",
        imageId: "img-ma",
        theme: "family",
        strokes: 6,
        difficulty: 1,
        ...activeMetadata,
      },
    ],
  },
  "content/corpus/poem-bank.json": {
    version: "corpus-v4",
    poems: [
      {
        id: "sc-ma",
        title: "妈妈",
        author: "测试",
        lines: ["妈妈爱我们"],
        charRefs: ["hz-ma-妈"],
        difficulty: 1,
        ...activeMetadata,
      },
    ],
  },
  "content/corpus/idiom-bank.json": {
    version: "corpus-v4",
    idioms: [],
  },
  "content/rules/mastery-v1.json": {
    ruleVersion: "mastery-v1",
    evidenceCaps: {
      firstLearn: 40,
      consolidation: 25,
      checkpoint: 25,
      delayedReview: 10,
    },
    guidedPoints: 20,
    statusThresholds: { practicing: 40, mastered: 70, stable: 85 },
    checkpointPassCorrect: 4,
  },
  "content/rules/progression-v1.json": {
    ruleVersion: "progression-v1",
    maxLevel: 30,
    baseXpPerLevel: 100,
    xpStepPerLevel: 20,
    accuracyBonus: { full: 10, high: 5, highThreshold: 0.9 },
    weeklyGoalDays: 5,
  },
  "content/rules/content-level-v1.json": {
    ruleVersion: "content-level-v1",
    minimumCumulativeContent: {
      "1": { characters: 0, poems: 0, chainableIdioms: 0 },
      "2": { characters: 0, poems: 0, chainableIdioms: 0 },
      "3": { characters: 0, poems: 0, chainableIdioms: 0 },
      "4": { characters: 0, poems: 0, chainableIdioms: 0 },
      "5": { characters: 0, poems: 0, chainableIdioms: 0 },
    },
  },
  "content/test-vectors/assessment.json": { cases: [] },
  "content/test-vectors/mastery.json": { ruleVersion: "mastery-v1", cases: [] },
  "content/test-vectors/progression.json": {
    ruleVersion: "progression-v1",
    cases: [],
  },
  "content/test-vectors/questions.json": {
    contentVersion: "corpus-v4",
    cases: [],
  },
};

function makeFs(entries = files): FileSystemPort {
  return {
    async readFile(path) {
      const value = entries[path];
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return new TextEncoder().encode(JSON.stringify(value));
    },
    async readJsonDir(dir) {
      return Object.entries(entries)
        .filter(([path]) => path.startsWith(`${dir}/`))
        .map(([path, json]) => ({ name: path.slice(dir.length + 1), json }));
    },
    async exists(path) {
      return entries[path] !== undefined;
    },
    async writeFile() {
      throw new Error("not used");
    },
  };
}

function makeDeps(goldenExitCode = 0, entries = files) {
  const calls: string[] = [];
  const uploaded: Array<{ key: string; body: Uint8Array; contentType: string }> = [];
  const storage: ObjectStoragePort = {
    upload: vi.fn(async (key, body, contentType) => {
      calls.push(`upload:${key}`);
      uploaded.push({ key, body, contentType });
      return `https://cdn.example/${key}`;
    }),
  };
  const admin: BackendAdminPort = {
    register: vi.fn(async () => {
      calls.push("register");
    }),
    transition: vi.fn(async (_version, toStatus) => {
      calls.push(`transition:${toStatus}`);
    }),
  };
  const runner: Runner = {
    exec: vi.fn(async () => ({
      code: goldenExitCode,
      stdout: "",
      stderr: goldenExitCode === 0 ? "" : "golden mismatch",
    })),
  };
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    deps: {
      fs: makeFs(entries),
      storage,
      admin,
      runner,
      logger,
      contentRoot: "content",
      repoRoot: "/repo",
    },
    calls,
    uploaded,
    storage,
    admin,
    runner,
  };
}

describe("publish", () => {
  it("uploads payload and sidecar before registering and advancing the state machine", async () => {
    const { deps, calls, uploaded, admin } = makeDeps();

    const outcome = await publish(deps, options);

    expect(outcome.ok).toBe(true);
    expect(outcome.finalStatus).toBe("PUBLISHED");
    expect(calls).toEqual([
      `upload:releases/corpus-v4/content-${outcome.sha256}.tar.gz`,
      `upload:releases/corpus-v4/manifest-${outcome.sha256}.json`,
      "register",
      "transition:VALIDATED",
      "transition:PUBLISHED",
    ]);
    expect(uploaded[1]?.contentType).toBe("application/json");
    expect(new TextDecoder().decode(uploaded[1]?.body)).toContain(
      '"masteryRuleVersion":"mastery-v1"',
    );
    expect(new TextDecoder().decode(uploaded[1]?.body)).toContain(
      '"progressionRuleVersion":"progression-v1"',
    );
    expect(new TextDecoder().decode(uploaded[1]?.body)).toContain(
      '"contentLevelRuleVersion":"content-level-v1"',
    );
    expect(admin.transition).toHaveBeenNthCalledWith(
      1,
      "corpus-v4",
      "VALIDATED",
      "teacher-1",
    );
  });

  it("does not upload or register when approval is blank", async () => {
    const { deps, storage, admin } = makeDeps();

    const outcome = await publish(deps, { ...options, approvedBy: "  " });

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ code: "NOT_APPROVED" }),
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(admin.register).not.toHaveBeenCalled();
  });

  it("does not upload or register when golden checks fail", async () => {
    const { deps, storage, admin } = makeDeps(1);

    const outcome = await publish(deps, options);

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ code: "GOLDEN_TS_FAILED" }),
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(admin.register).not.toHaveBeenCalled();
  });

  it("does not start golden checks, upload, or register when validation fails", async () => {
    const invalidFiles = {
      ...files,
      "content/corpus/character-bank.json": {
        ...files["content/corpus/character-bank.json"],
        version: "corpus-v2",
      },
    };
    const { deps, storage, admin, runner } = makeDeps(0, invalidFiles);

    const outcome = await publish(deps, options);

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ code: "CONTENT_VERSION_MISMATCH" }),
    );
    expect(runner.exec).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(admin.register).not.toHaveBeenCalled();
  });

  it("dry-runs without touching object storage or the admin API", async () => {
    const { deps, storage, admin } = makeDeps();

    const outcome = await publish(deps, { ...options, dryRun: true });

    expect(outcome.ok).toBe(true);
    expect(outcome.manifestUrl).toBeNull();
    expect(outcome.finalStatus).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(admin.register).not.toHaveBeenCalled();
  });
});
