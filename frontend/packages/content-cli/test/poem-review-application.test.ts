import { describe, expect, it } from "vitest";
import type { GuwendaoPoemCandidate } from "../src/guwendao-poem-candidates";
import {
  PoemReviewAdminError,
  type PoemReviewAdminPort,
} from "../src/poem-review-admin";
import {
  applyPoemReview,
  generatePoemReview,
  PoemReviewExecutionError,
} from "../src/poem-review-application";
import { sha256Text } from "../src/poem-identity";
import {
  type AdminPoemItem,
  parsePoemReview,
  serializePoemReview,
  type ValidationResponse,
} from "../src/poem-review";

const TITLE_DISAMBIGUATED_CANDIDATE_IDS = [
  "sc-gwd-05c6c4ccf634",
  "sc-gwd-09fd71c77ec7",
  "sc-gwd-0c472e85a3ad",
  "sc-gwd-2d27cb0ecae4",
] as const;

function candidate(
  index: number,
  sourceId = index.toString(16).padStart(12, "0"),
): GuwendaoPoemCandidate {
  const sourceUrl = `https://www.guwendao.net/shiwenv_${sourceId}.aspx`;
  return {
    importKey: `GUWENDAO_TANG:${sourceId}`,
    source: "GUWENDAO_TANG",
    sourceRef: sourceUrl,
    sourceHash: index.toString(16).padStart(64, "0"),
    ruleVersion: "guwendao-tang-poem-v2",
    id: `sc-gwd-${sourceId}`,
    type: "POEM",
    suggestedLevel: 5,
    suggestedDifficulty: 5,
    promotionRequired: true,
    tags: ["唐诗", "古文岛", "五言绝句"],
    payload: {
      title: `测试诗 ${index}`,
      author: `作者 ${index}`,
      lines: [`正文 ${index}，第一句。`, `正文 ${index}，第二句。`],
      charRefs: [],
      source: {
        sourceId,
        dynasty: "唐代",
        category: "五言绝句",
        sourceUrl,
      },
    },
    score: 100,
  };
}

function expectedBackendRevision(id: string): number {
  return TITLE_DISAMBIGUATED_CANDIDATE_IDS.some(
    (candidateId) => candidateId === id,
  )
    ? 2
    : 1;
}

function backendItem(
  value: GuwendaoPoemCandidate,
  overrides: Partial<AdminPoemItem> = {},
): AdminPoemItem {
  return {
    id: value.id,
    type: "POEM",
    status: "DRAFT",
    revision: expectedBackendRevision(value.id),
    level: "L5",
    difficulty: "L5",
    promotionRequired: value.promotionRequired,
    tags: [...value.tags],
    payload: structuredClone(value.payload),
    ...overrides,
  };
}

function fixture(): {
  candidateText: string;
  catalog: AdminPoemItem[];
} {
  const candidates = Array.from({ length: 320 }, (_, index) => {
    const disambiguatedId =
      TITLE_DISAMBIGUATED_CANDIDATE_IDS[
        index - (320 - TITLE_DISAMBIGUATED_CANDIDATE_IDS.length)
      ];
    return candidate(index, disambiguatedId?.slice("sc-gwd-".length));
  });
  const candidateText =
    `${candidates.map((value) => JSON.stringify(value)).join("\n")}\n`;
  const duplicateTargets = candidates.slice(0, 10).map((value, index) =>
    backendItem(value, {
      id: `poem-active-${index.toString().padStart(2, "0")}`,
      status: "ACTIVE",
      revision: 7,
    }),
  );
  const otherActivePoems = candidates.slice(10, 23).map((value, index) =>
    backendItem(value, {
      id: `poem-active-${(index + 10).toString().padStart(2, "0")}`,
      status: "ACTIVE",
      revision: 7,
      payload: {
        ...structuredClone(value.payload),
        lines: [`正式正文 ${index}，第一句。`, `正式正文 ${index}，第二句。`],
      },
    }),
  );
  return {
    candidateText,
    catalog: [
      ...duplicateTargets,
      ...candidates.map((value) => backendItem(value)),
      ...otherActivePoems,
    ],
  };
}

class InMemoryPoemReviewAdmin implements PoemReviewAdminPort {
  listCalls = 0;
  readonly validateCalls: string[] = [];
  readonly validationById = new Map<string, ValidationResponse>();
  readonly actionCalls: Array<{
    action: "activate" | "archive";
    id: string;
    expectedRevision: number;
  }> = [];
  actionOverride?: (
    action: "activate" | "archive",
    item: AdminPoemItem,
  ) => Promise<AdminPoemItem>;
  listOverride?: (
    items: AdminPoemItem[],
    call: number,
  ) => AdminPoemItem[];
  validateOverride?: (id: string) => Promise<ValidationResponse>;

  constructor(readonly items: Map<string, AdminPoemItem>) {}

  async listPoems(): Promise<AdminPoemItem[]> {
    this.listCalls += 1;
    const items = [...this.items.values()].map((item) => structuredClone(item));
    return this.listOverride?.(items, this.listCalls) ?? items;
  }

  async validate(id: string) {
    this.validateCalls.push(id);
    if (this.validateOverride !== undefined) {
      return this.validateOverride(id);
    }
    return this.validationById.get(id) ?? { valid: true, issues: [] };
  }

  async activate(
    id: string,
    expectedRevision: number,
  ): Promise<AdminPoemItem> {
    this.actionCalls.push({ action: "activate", id, expectedRevision });
    const item = this.items.get(id)!;
    if (this.actionOverride !== undefined) {
      return this.actionOverride("activate", item);
    }
    item.status = "ACTIVE";
    return structuredClone(item);
  }

  async archive(
    id: string,
    expectedRevision: number,
  ): Promise<AdminPoemItem> {
    this.actionCalls.push({ action: "archive", id, expectedRevision });
    const item = this.items.get(id)!;
    if (this.actionOverride !== undefined) {
      return this.actionOverride("archive", item);
    }
    item.status = "ARCHIVED";
    return structuredClone(item);
  }
}

function setup() {
  const value = fixture();
  const admin = new InMemoryPoemReviewAdmin(
    new Map(value.catalog.map((item) => [item.id, item])),
  );
  return { ...value, admin };
}

async function executionSetup() {
  const value = setup();
  const generated = await generatePoemReview({
    candidateText: value.candidateText,
    expectedCandidateSha256: sha256Text(value.candidateText),
    admin: value.admin,
  });
  value.admin.validateCalls.length = 0;
  return { ...value, checklistText: generated.checklistText };
}

async function captureExecutionError(
  execution: Promise<unknown>,
): Promise<PoemReviewExecutionError> {
  try {
    await execution;
  } catch (error) {
    if (error instanceof PoemReviewExecutionError) return error;
    throw error;
  }
  throw new Error("expected PoemReviewExecutionError");
}

describe("generatePoemReview", () => {
  it("generates a complete review from one catalog snapshot and validates every activation", async () => {
    const { candidateText, admin } = setup();

    const generated = await generatePoemReview({
      candidateText,
      expectedCandidateSha256: sha256Text(candidateText),
      admin,
    });

    expect(generated.entries).toHaveLength(320);
    expect(
      generated.entries.filter(({ decision }) => decision === "ACTIVATE"),
    ).toHaveLength(310);
    expect(
      generated.entries.filter(
        ({ decision }) => decision === "ARCHIVE_DUPLICATE",
      ),
    ).toHaveLength(10);
    expect(admin.validateCalls).toEqual(
      generated.entries
        .filter(({ decision }) => decision === "ACTIVATE")
        .map(({ id }) => id),
    );
    expect(admin.listCalls).toBe(1);
    expect(admin.actionCalls).toEqual([]);
    expect(parsePoemReview(generated.checklistText)).toEqual(generated.entries);
    expect(generated.summaryText).toContain(
      `- Candidate SHA-256: \`${sha256Text(candidateText)}\``,
    );
    expect(generated.summaryText).toContain(
      `- Checklist SHA-256: \`${sha256Text(generated.checklistText)}\``,
    );
  });
});

describe("applyPoemReview", () => {
  it("rejects null and non-array preflight catalogs before validation or writes", async () => {
    for (const catalog of [null, { items: [] }]) {
      const { checklistText, admin } = await executionSetup();
      Reflect.set(admin, "listPoems", async () => catalog);
      const now = () => new Date("2026-10-08T00:00:00Z");

      await expect(
        applyPoemReview({ checklistText, admin, now }),
      ).rejects.toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 0,
          archived: 0,
          skipped: 0,
          failed: 1,
          results: [],
          failure: {
            phase: "preflight catalog",
            error: expect.stringContaining("catalog must be an array"),
          },
        },
      });
      expect(admin.validateCalls).toEqual([]);
      expect(admin.actionCalls).toEqual([]);
    }
  });

  it("rejects malformed preflight catalog items and payloads before validation or writes", async () => {
    const scenarios: Array<{
      name: string;
      mutate: (items: AdminPoemItem[]) => void;
      error: string;
    }> = [
      {
        name: "null item",
        mutate: (items) => {
          Reflect.set(items, 0, null);
        },
        error: "catalog[0] must be an object",
      },
      {
        name: "missing id",
        mutate: (items) => {
          Reflect.deleteProperty(items[0]!, "id");
        },
        error: "catalog[0].id must be a non-empty string",
      },
      {
        name: "empty id",
        mutate: (items) => {
          items[0]!.id = "";
        },
        error: "catalog[0].id must be a non-empty string",
      },
      {
        name: "invalid type",
        mutate: (items) => {
          Reflect.set(items[0]!, "type", "IDIOM");
        },
        error: "catalog[0].type must be POEM",
      },
      {
        name: "invalid status",
        mutate: (items) => {
          Reflect.set(items[0]!, "status", "REMOVED");
        },
        error: "catalog[0].status is invalid",
      },
      {
        name: "invalid revision",
        mutate: (items) => {
          Reflect.set(items[0]!, "revision", 1.5);
        },
        error: "catalog[0].revision must be a non-negative integer",
      },
      {
        name: "non-number revision",
        mutate: (items) => {
          Reflect.set(items[0]!, "revision", "2");
        },
        error: "catalog[0].revision must be a non-negative integer",
      },
      {
        name: "negative revision",
        mutate: (items) => {
          items[0]!.revision = -1;
        },
        error: "catalog[0].revision must be a non-negative integer",
      },
      {
        name: "missing payload",
        mutate: (items) => {
          Reflect.deleteProperty(items[0]!, "payload");
        },
        error: "catalog[0].payload must be an object",
      },
      {
        name: "invalid author",
        mutate: (items) => {
          Reflect.set(items[0]!.payload, "author", null);
        },
        error: "catalog[0].payload.author must be a string",
      },
      {
        name: "invalid lines",
        mutate: (items) => {
          Reflect.set(items[0]!.payload, "lines", [null]);
        },
        error: "catalog[0].payload.lines[0] must be a string",
      },
      {
        name: "non-array lines",
        mutate: (items) => {
          Reflect.set(items[0]!.payload, "lines", null);
        },
        error: "catalog[0].payload.lines must be an array",
      },
      {
        name: "non-JSON payload",
        mutate: (items) => {
          Reflect.set(items[0]!.payload, "unexpected", undefined);
        },
        error: "catalog[0].payload is not canonical JSON",
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      admin.listOverride = (items, call) => {
        if (call === 2) scenario.mutate(items);
        return items;
      };
      const now = () => new Date("2026-10-08T00:00:00Z");

      const error = await captureExecutionError(
        applyPoemReview({ checklistText, admin, now }),
      );
      expect(error, scenario.name).toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 0,
          archived: 0,
          skipped: 0,
          failed: 1,
          results: [],
          failure: {
            phase: "preflight catalog",
            error: expect.stringContaining(scenario.error),
          },
        },
      });
      expect(admin.validateCalls, scenario.name).toEqual([]);
      expect(admin.actionCalls, scenario.name).toEqual([]);
    }
  });

  it("rejects duplicate IDs outside the candidate set before validation or writes", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.listOverride = (items, call) => {
      if (call === 2) {
        items.push(structuredClone(items[0]!));
      }
      return items;
    };
    const duplicateId = admin.items.values().next().value!.id;
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      name: "PoemReviewExecutionError",
      report: {
        activated: 0,
        archived: 0,
        skipped: 0,
        failed: 1,
        results: [],
        failure: {
          phase: "preflight catalog",
          error: expect.stringContaining(`duplicate ID ${duplicateId}`),
        },
      },
    });
    expect(admin.validateCalls).toEqual([]);
    expect(admin.actionCalls).toEqual([]);
  });

  it("rejects a mismatched backend candidate ID multiset before validation or writes", async () => {
    const scenarios: Array<{
      name: string;
      mutate: (items: AdminPoemItem[]) => AdminPoemItem[];
    }> = [
      {
        name: "missing candidate",
        mutate: (items) =>
          items.filter(({ id }) => id !== "sc-gwd-00000000000a"),
      },
      {
        name: "extra candidate",
        mutate: (items) => [
          ...items,
          backendItem(candidate(320)),
        ],
      },
      {
        name: "duplicate candidate",
        mutate: (items) => [
          ...items,
          structuredClone(
            items.find(({ id }) => id === "sc-gwd-00000000000a")!,
          ),
        ],
      },
      {
        name: "replaced candidate",
        mutate: (items) => [
          ...items.filter(({ id }) => id !== "sc-gwd-00000000000a"),
          backendItem(candidate(320)),
        ],
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      admin.listOverride = (items, call) =>
        call === 2 ? scenario.mutate(items) : items;
      const now = () => new Date("2026-10-08T00:00:00Z");

      await expect(
        applyPoemReview({ checklistText, admin, now }),
        scenario.name,
      ).rejects.toMatchObject({
        report: {
          activated: 0,
          archived: 0,
          skipped: 0,
          failed: 1,
        },
      });
      expect(admin.validateCalls, scenario.name).toEqual([]);
      expect(admin.actionCalls, scenario.name).toEqual([]);
    }
  });

  it("does no writes when any preflight item drifted", async () => {
    const { checklistText, admin } = await executionSetup();
    const driftedId = "sc-gwd-000000000001";
    admin.items.get(driftedId)!.revision = 3;
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      report: {
        activated: 0,
        archived: 0,
        skipped: 0,
        failed: 1,
        failure: {
          phase: "preflight",
          id: driftedId,
          error: `preflight ${driftedId}: revision does not match checklist`,
        },
      },
    });
    expect(admin.actionCalls).toEqual([]);
  });

  it("records serializable failure summaries without inventing phase results", async () => {
    const phaseFailure = await executionSetup();
    const now = () => new Date("2026-10-08T00:00:00Z");
    let checklistError: unknown;
    try {
      await applyPoemReview({
        checklistText: "{\n",
        admin: phaseFailure.admin,
        now,
      });
    } catch (error) {
      checklistError = error;
    }

    expect(checklistError).toMatchObject({
      report: {
        failure: {
          phase: "checklist",
          error: expect.stringContaining("checklist:"),
        },
        results: [],
      },
    });
    expect(() =>
      JSON.stringify((checklistError as { report: unknown }).report),
    ).not.toThrow();

    const postflightFailure = await executionSetup();
    postflightFailure.admin.listOverride = (items, call) => {
      if (call === 3) {
        items.push({
          ...structuredClone(items.find(({ status }) => status === "ACTIVE")!),
          id: "extra-active-poem",
        });
      }
      return items;
    };
    let postflightError: unknown;
    try {
      await applyPoemReview({
        checklistText: postflightFailure.checklistText,
        admin: postflightFailure.admin,
        now,
      });
    } catch (error) {
      postflightError = error;
    }

    expect(postflightError).toMatchObject({
      report: {
        failure: {
          phase: "postflight verification",
          error: "postflight verification failed",
        },
        results: expect.arrayContaining([
          expect.objectContaining({ result: "ACTIVATED" }),
          expect.objectContaining({ result: "ARCHIVED" }),
        ]),
      },
    });
    expect(
      (postflightError as { report: { results: unknown[] } }).report.results,
    ).toHaveLength(320);
  });

  it("archives duplicates before activating candidates and verifies final counts", async () => {
    const { checklistText, admin } = await executionSetup();
    const now = () => new Date("2026-10-08T00:00:00Z");

    const report = await applyPoemReview({ checklistText, admin, now });

    expect(admin.actionCalls.slice(0, 10).every(
      ({ action }) => action === "archive",
    )).toBe(true);
    expect(admin.actionCalls.slice(10).every(
      ({ action }) => action === "activate",
    )).toBe(true);
    expect(
      admin.actionCalls.every(
        ({ id, expectedRevision }) =>
          expectedRevision === expectedBackendRevision(id),
      ),
    ).toBe(true);
    expect(admin.actionCalls).toEqual(
      expect.arrayContaining([
        {
          action: "archive",
          id: "sc-gwd-000000000000",
          expectedRevision: 1,
        },
        ...TITLE_DISAMBIGUATED_CANDIDATE_IDS.map((id) => ({
          action: "activate" as const,
          id,
          expectedRevision: 2,
        })),
      ]),
    );
    expect(admin.listCalls).toBe(3);
    expect(report).toMatchObject({
      checklistSha256: sha256Text(checklistText),
      startedAt: "2026-10-08T00:00:00.000Z",
      finishedAt: "2026-10-08T00:00:00.000Z",
      activated: 310,
      archived: 10,
      skipped: 0,
      failed: 0,
      verification: {
        activePoems: 333,
        activeCandidates: 310,
        archivedCandidates: 10,
        draftCandidates: 0,
        duplicateActiveGroups: 0,
      },
    });
    expect(report.results).toHaveLength(320);
  });

  it("skips matching target states and resumes remaining drafts", async () => {
    const { checklistText, admin } = await executionSetup();
    const entries = parsePoemReview(checklistText);
    const archiveEntries = entries.filter(
      ({ decision }) => decision === "ARCHIVE_DUPLICATE",
    );
    const activateEntries = entries.filter(
      ({ decision }) => decision === "ACTIVATE",
    );
    for (const entry of archiveEntries.slice(0, 4)) {
      admin.items.get(entry.id)!.status = "ARCHIVED";
    }
    for (const entry of activateEntries.slice(0, 100)) {
      admin.items.get(entry.id)!.status = "ACTIVE";
    }
    const now = () => new Date("2026-10-08T00:00:00Z");

    const report = await applyPoemReview({ checklistText, admin, now });

    expect(report).toMatchObject({
      skipped: 104,
      archived: 6,
      activated: 210,
      failed: 0,
    });
    expect(admin.actionCalls).toHaveLength(216);
    expect(
      report.results.filter(
        ({ result }) => result === "SKIPPED_ALREADY_APPLIED",
      ),
    ).toHaveLength(104);
  });

  it("rejects revision, payload, and identity drift for target-state skips", async () => {
    const drifts: Array<{
      name: string;
      arrange: (
        checklistText: string,
        item: AdminPoemItem,
      ) => string;
    }> = [
      {
        name: "revision",
        arrange: (text, item) => {
          item.revision += 1;
          return text;
        },
      },
      {
        name: "payload",
        arrange: (text, item) => {
          item.payload.title = "目标状态漂移标题";
          return text;
        },
      },
      {
        name: "identity",
        arrange: (text, item) => {
          const entries = parsePoemReview(text);
          entries.find(({ id }) => id === item.id)!.poemIdentityHash =
            "f".repeat(64);
          return serializePoemReview(entries);
        },
      },
    ];

    for (const decision of ["ARCHIVE_DUPLICATE", "ACTIVATE"] as const) {
      for (const drift of drifts) {
        const { checklistText: original, admin } = await executionSetup();
        const entry = parsePoemReview(original).find(
          (value) => value.decision === decision,
        )!;
        const item = admin.items.get(entry.id)!;
        item.status = decision === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
        const checklistText = drift.arrange(original, item);
        const now = () => new Date("2026-10-08T00:00:00Z");

        await expect(
          applyPoemReview({ checklistText, admin, now }),
          `${decision} ${drift.name}`,
        ).rejects.toMatchObject({
          report: {
            activated: 0,
            archived: 0,
            skipped: 0,
            failed: 1,
            failure: {
              phase: "preflight",
              id: entry.id,
            },
          },
        });
        expect(admin.validateCalls, `${decision} ${drift.name}`).toEqual([]);
        expect(admin.actionCalls, `${decision} ${drift.name}`).toEqual([]);
      }
    }
  });

  it("validates every activation and does no writes when one is invalid", async () => {
    const { checklistText, admin } = await executionSetup();
    const activationIds = parsePoemReview(checklistText)
      .filter(({ decision }) => decision === "ACTIVATE")
      .map(({ id }) => id);
    const failedId = activationIds.at(-1)!;
    admin.validationById.set(failedId, {
      valid: false,
      issues: [{
        code: "POEM_DUPLICATE_ACTIVE",
        itemId: failedId,
        path: "/payload/lines",
        message: "duplicate",
      }],
    });
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      report: { activated: 0, archived: 0, failed: 1 },
    });
    expect(admin.validateCalls).toEqual(activationIds);
    expect(admin.actionCalls).toEqual([]);
  });

  it("rejects candidate and duplicate-target snapshot drift before any write", async () => {
    const scenarios: Array<{
      name: string;
      arrange: (
        checklistText: string,
        admin: InMemoryPoemReviewAdmin,
      ) => string;
    }> = [
      {
        name: "missing candidate",
        arrange: (text, admin) => {
          admin.items.delete("sc-gwd-00000000000a");
          return text;
        },
      },
      {
        name: "candidate type",
        arrange: (text, admin) => {
          admin.items.get("sc-gwd-00000000000a")!.type =
            "IDIOM" as AdminPoemItem["type"];
          return text;
        },
      },
      {
        name: "candidate status",
        arrange: (text, admin) => {
          admin.items.get("sc-gwd-00000000000a")!.status = "ARCHIVED";
          return text;
        },
      },
      {
        name: "candidate revision",
        arrange: (text, admin) => {
          admin.items.get("sc-gwd-00000000000a")!.revision = 3;
          return text;
        },
      },
      {
        name: "candidate payload",
        arrange: (text, admin) => {
          admin.items.get("sc-gwd-00000000000a")!.payload.title = "漂移标题";
          return text;
        },
      },
      {
        name: "candidate identity hash",
        arrange: (text) => {
          const entries = parsePoemReview(text);
          entries[10]!.poemIdentityHash = "f".repeat(64);
          return serializePoemReview(entries);
        },
      },
      {
        name: "missing duplicate target",
        arrange: (text, admin) => {
          admin.items.delete("poem-active-00");
          return text;
        },
      },
      {
        name: "inactive duplicate target",
        arrange: (text, admin) => {
          admin.items.get("poem-active-00")!.status = "ARCHIVED";
          return text;
        },
      },
      {
        name: "different duplicate target identity",
        arrange: (text, admin) => {
          admin.items.get("poem-active-00")!.payload.lines = ["其他正文"];
          return text;
        },
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText: original, admin } = await executionSetup();
      const checklistText = scenario.arrange(original, admin);
      const now = () => new Date("2026-10-08T00:00:00Z");
      let thrown: unknown;
      try {
        await applyPoemReview({ checklistText, admin, now });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, scenario.name).toMatchObject({
        report: { activated: 0, archived: 0, failed: 1 },
      });
      expect(admin.actionCalls, scenario.name).toEqual([]);
    }
  });

  it("stops on the first action failure and preserves earlier results", async () => {
    const failures: Array<{
      name: string;
      fail: () => Promise<AdminPoemItem>;
    }> = [
      {
        name: "409 conflict",
        fail: async () => {
          throw new PoemReviewAdminError(
            "HTTP 409 CONTENT_REVISION_CONFLICT",
          );
        },
      },
      {
        name: "422 validation",
        fail: async () => {
          throw new PoemReviewAdminError(
            "HTTP 422 CONTENT_VALIDATION_FAILED",
          );
        },
      },
      {
        name: "403 permission",
        fail: async () => {
          throw new PoemReviewAdminError("HTTP 403 FORBIDDEN");
        },
      },
      {
        name: "network",
        fail: async () => {
          throw new Error("network unavailable");
        },
      },
      {
        name: "malformed response",
        fail: async () => null as unknown as AdminPoemItem,
      },
    ];

    for (const failure of failures) {
      const { checklistText, admin } = await executionSetup();
      const firstActivation = parsePoemReview(checklistText).find(
        ({ decision }) => decision === "ACTIVATE",
      )!.id;
      admin.actionOverride = async (action, item) => {
        if (action === "activate" && item.id === firstActivation) {
          return failure.fail();
        }
        item.status = action === "activate" ? "ACTIVE" : "ARCHIVED";
        return structuredClone(item);
      };
      const now = () => new Date("2026-10-08T00:00:00Z");
      let thrown: unknown;
      try {
        await applyPoemReview({ checklistText, admin, now });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, failure.name).toMatchObject({
        report: {
          activated: 0,
          archived: 10,
          skipped: 0,
          failed: 1,
        },
      });
      expect(admin.actionCalls, failure.name).toHaveLength(11);
      expect(
        (thrown as { report: { results: unknown[] } }).report.results,
        failure.name,
      ).toHaveLength(11);
    }
  });

  it("rejects action responses that do not preserve content invariants", async () => {
    const mutations: Array<{
      name: string;
      mutate: (response: AdminPoemItem) => void;
    }> = [
      {
        name: "wrong id",
        mutate: (response) => {
          response.id = "different-id";
        },
      },
      {
        name: "wrong type",
        mutate: (response) => {
          response.type = "IDIOM" as AdminPoemItem["type"];
        },
      },
      {
        name: "wrong status",
        mutate: (response) => {
          response.status = "DRAFT";
        },
      },
      {
        name: "changed revision",
        mutate: (response) => {
          response.revision += 1;
        },
      },
      {
        name: "changed payload",
        mutate: (response) => {
          response.payload.title = "意外修改";
        },
      },
    ];

    for (const decision of ["ARCHIVE_DUPLICATE", "ACTIVATE"] as const) {
      for (const mutation of mutations) {
        const { checklistText, admin } = await executionSetup();
        const firstEntry = parsePoemReview(checklistText).find(
          (entry) => entry.decision === decision,
        )!;
        admin.actionOverride = async (action, item) => {
          item.status = action === "activate" ? "ACTIVE" : "ARCHIVED";
          const response = structuredClone(item);
          if (item.id === firstEntry.id) mutation.mutate(response);
          return response;
        };
        const now = () => new Date("2026-10-08T00:00:00Z");
        let thrown: unknown;
        try {
          await applyPoemReview({ checklistText, admin, now });
        } catch (error) {
          thrown = error;
        }
        const context = `${decision} ${mutation.name}`;

        expect(thrown, context).toMatchObject({
          report: {
            activated: 0,
            archived: decision === "ACTIVATE" ? 10 : 0,
            failed: 1,
            failure: {
              phase: decision === "ACTIVATE" ? "activate" : "archive",
              id: firstEntry.id,
            },
          },
        });
        expect(admin.actionCalls, context).toHaveLength(
          decision === "ACTIVATE" ? 11 : 1,
        );
      }
    }
  });

  it("fails postflight when any final count or duplicate check is wrong", async () => {
    const scenarios: Array<{
      name: string;
      mutate: (items: AdminPoemItem[]) => void;
    }> = [
      {
        name: "active poem count",
        mutate: (items) => {
          const extra = structuredClone(
            items.find(({ id }) => id === "poem-active-22")!,
          );
          extra.payload.author = "额外作者";
          items.push({
            ...extra,
            id: "extra-active-poem",
          });
        },
      },
      {
        name: "active candidate count",
        mutate: (items) => {
          const extra = structuredClone(
            items.find(({ id }) => id === "poem-active-22")!,
          );
          extra.id = "sc-gwd-extra-active";
          items.splice(
            items.findIndex(({ id }) => id === "poem-active-22"),
            1,
            extra,
          );
        },
      },
      {
        name: "archived candidate count",
        mutate: (items) => {
          items.push({
            ...structuredClone(items.find(({ id }) => id === "poem-active-22")!),
            id: "sc-gwd-extra-archived",
            status: "ARCHIVED",
          });
        },
      },
      {
        name: "draft candidate count",
        mutate: (items) => {
          items.push({
            ...structuredClone(items[0]!),
            id: "sc-gwd-extra-draft",
            status: "DRAFT",
          });
        },
      },
      {
        name: "duplicate active identity",
        mutate: (items) => {
          items.push({
            ...structuredClone(items.find(({ status }) => status === "ACTIVE")!),
            id: "duplicate-active-poem",
          });
        },
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      admin.listOverride = (items, call) => {
        if (call >= 3) scenario.mutate(items);
        return items;
      };
      const now = () => new Date("2026-10-08T00:00:00Z");
      const error = await captureExecutionError(
        applyPoemReview({ checklistText, admin, now }),
      );

      expect(error, scenario.name).toMatchObject({
        report: {
          activated: 310,
          archived: 10,
          failed: 1,
          verification: expect.any(Object),
        },
      });
      expect(error.report.results, scenario.name).toHaveLength(320);
      expect(
        error.report.results.some(({ result }) => result === "FAILED"),
        scenario.name,
      ).toBe(false);
      expect(admin.actionCalls, scenario.name).toHaveLength(320);
    }
  });

  it("detects an independent duplicate active group with all counts intact", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.listOverride = (items, call) => {
      if (call === 3) {
        const first = items.find(({ id }) => id === "poem-active-10")!;
        const second = items.find(({ id }) => id === "poem-active-11")!;
        second.payload.author = first.payload.author;
        second.payload.lines = structuredClone(first.payload.lines);
      }
      return items;
    };
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      report: {
        activated: 310,
        archived: 10,
        failed: 1,
        failure: {
          phase: "postflight verification",
          error: "postflight verification failed",
        },
        verification: {
          activePoems: 333,
          activeCandidates: 310,
          archivedCandidates: 10,
          draftCandidates: 0,
          duplicateActiveGroups: 1,
        },
      },
    });
    expect(admin.actionCalls).toHaveLength(320);
  });

  it("reports checklist and preflight port failures without writing", async () => {
    const malformed = await executionSetup();
    const listFailure = await executionSetup();
    listFailure.admin.listOverride = (_items, call) => {
      if (call === 2) throw new PoemReviewAdminError("catalog unavailable");
      return _items;
    };
    const validationFailure = await executionSetup();
    validationFailure.admin.validateOverride = async () => {
      throw new PoemReviewAdminError("validation unavailable");
    };
    const now = () => new Date("2026-10-08T00:00:00Z");
    const attempts = [
      {
        name: "malformed checklist",
        admin: malformed.admin,
        checklistText: "{\n",
      },
      {
        name: "catalog failure",
        admin: listFailure.admin,
        checklistText: listFailure.checklistText,
      },
      {
        name: "validation failure",
        admin: validationFailure.admin,
        checklistText: validationFailure.checklistText,
      },
    ];

    for (const attempt of attempts) {
      let thrown: unknown;
      try {
        await applyPoemReview({
          checklistText: attempt.checklistText,
          admin: attempt.admin,
          now,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, attempt.name).toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 0,
          archived: 0,
          skipped: 0,
          failed: 1,
        },
      });
      expect(attempt.admin.actionCalls, attempt.name).toEqual([]);
    }
  });

  it("reports a first archive failure without attempting later actions", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.actionOverride = async (action, item) => {
      if (action === "archive") throw "archive transport failure";
      item.status = "ACTIVE";
      return structuredClone(item);
    };
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("admin operation failed"),
      report: {
        activated: 0,
        archived: 0,
        skipped: 0,
        failed: 1,
        results: [{
          decision: "ARCHIVE_DUPLICATE",
          result: "FAILED",
        }],
      },
    });
    expect(admin.actionCalls).toHaveLength(1);
  });

  it("does not expose an unknown port error in the thrown error or report", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.actionOverride = async () => {
      throw new Error("request failed with secret-token=top-secret");
    };
    const now = () => new Date("2026-10-08T00:00:00Z");
    let thrown: unknown;

    try {
      await applyPoemReview({ checklistText, admin, now });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "PoemReviewExecutionError",
      message: expect.stringContaining("admin operation failed"),
    });
    const exposed = [
      (thrown as Error).message,
      JSON.stringify((thrown as { report: unknown }).report),
    ].join("\n");
    expect(exposed).not.toContain("secret-token");
    expect(exposed).not.toContain("top-secret");
  });

  it("preserves completed actions when the postflight snapshot fails", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.listOverride = (items, call) => {
      if (call === 3) {
        throw new PoemReviewAdminError("postflight unavailable");
      }
      return items;
    };
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      name: "PoemReviewExecutionError",
      message: expect.stringContaining("postflight unavailable"),
      report: {
        activated: 310,
        archived: 10,
        skipped: 0,
        failed: 1,
      },
    });
    expect(admin.actionCalls).toHaveLength(320);
  });

  it("preserves completed results when the postflight catalog is malformed", async () => {
    const scenarios: Array<{
      name: string;
      mutate: (items: AdminPoemItem[]) => unknown;
      error: string;
    }> = [
      {
        name: "null catalog",
        mutate: () => null,
        error: "catalog must be an array",
      },
      {
        name: "null item",
        mutate: (items) => {
          Reflect.set(items, 0, null);
          return items;
        },
        error: "catalog[0] must be an object",
      },
      {
        name: "malformed payload",
        mutate: (items) => {
          Reflect.set(items[0]!.payload, "author", null);
          return items;
        },
        error: "catalog[0].payload.author must be a string",
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      const listPoems = admin.listPoems.bind(admin);
      Reflect.set(admin, "listPoems", async () => {
        const items = await listPoems();
        return admin.listCalls === 3 ? scenario.mutate(items) : items;
      });
      const now = () => new Date("2026-10-08T00:00:00Z");

      const error = await captureExecutionError(
        applyPoemReview({ checklistText, admin, now }),
      );
      expect(error, scenario.name).toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 310,
          archived: 10,
          skipped: 0,
          failed: 1,
          results: expect.arrayContaining([
            expect.objectContaining({ result: "ACTIVATED" }),
            expect.objectContaining({ result: "ARCHIVED" }),
          ]),
          failure: {
            phase: "postflight catalog",
            error: expect.stringContaining(scenario.error),
          },
        },
      });
      expect(error.report.results, scenario.name).toHaveLength(320);
      expect(
        error.report.results.some(({ result }) => result === "FAILED"),
        scenario.name,
      ).toBe(false);
      expect(admin.actionCalls, scenario.name).toHaveLength(320);
    }
  });

  it("detects per-entry postflight drift before aggregate verification", async () => {
    const scenarios: Array<{
      name: string;
      select: (
        entries: ReturnType<typeof parsePoemReview>,
      ) => ReturnType<typeof parsePoemReview>[number];
      mutate: (
        items: AdminPoemItem[],
        entry: ReturnType<typeof parsePoemReview>[number],
      ) => void;
      error: string;
    }> = [
      {
        name: "revision",
        select: (entries) =>
          entries.find(({ decision }) => decision === "ACTIVATE")!,
        mutate: (items, entry) => {
          items.find(({ id }) => id === entry.id)!.revision += 1;
        },
        error: "revision does not match checklist",
      },
      {
        name: "missing item",
        select: (entries) =>
          entries.find(({ decision }) => decision === "ACTIVATE")!,
        mutate: (items, entry) => {
          items.find(({ id }) => id === entry.id)!.id =
            "sc-gwd-postflight-replacement";
        },
        error: "item is missing",
      },
      {
        name: "payload",
        select: (entries) =>
          entries.find(({ decision }) => decision === "ACTIVATE")!,
        mutate: (items, entry) => {
          items.find(({ id }) => id === entry.id)!.payload.title =
            "postflight drift";
        },
        error: "payload does not match checklist",
      },
      {
        name: "identity",
        select: (entries) =>
          entries.find(({ decision }) => decision === "ACTIVATE")!,
        mutate: (items, entry) => {
          items.find(({ id }) => id === entry.id)!.payload.author =
            "postflight identity drift";
        },
        error: "identity does not match checklist",
      },
      {
        name: "target status",
        select: (entries) =>
          entries.find(
            ({ decision }) => decision === "ARCHIVE_DUPLICATE",
          )!,
        mutate: (items, entry) => {
          const archived = items.find(({ id }) => id === entry.id)!;
          const active = items.find(
            ({ id, status }) =>
              id.startsWith("sc-gwd-") && status === "ACTIVE",
          )!;
          archived.status = "ACTIVE";
          archived.payload = structuredClone(active.payload);
          active.status = "ARCHIVED";
        },
        error: "status must be ARCHIVED",
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      const entry = scenario.select(parsePoemReview(checklistText));
      admin.listOverride = (items, call) => {
        if (call === 3) scenario.mutate(items, entry);
        return items;
      };
      const now = () => new Date("2026-10-08T00:00:00Z");

      const error = await captureExecutionError(
        applyPoemReview({ checklistText, admin, now }),
      );
      expect(error, scenario.name).toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 310,
          archived: 10,
          failed: 1,
          results: expect.arrayContaining([
            expect.objectContaining({ id: entry.id }),
          ]),
          failure: {
            phase: "postflight verification",
            id: entry.id,
            error: `postflight ${entry.id}: ${scenario.error}`,
          },
        },
      });
      expect(error.report.results, scenario.name).toHaveLength(320);
      expect(
        error.report.results.some(({ result }) => result === "FAILED"),
        scenario.name,
      ).toBe(false);
      expect(admin.actionCalls, scenario.name).toHaveLength(320);
    }
  });

  it("detects postflight duplicate-target drift with aggregate counts intact", async () => {
    const scenarios: Array<{
      name: string;
      mutate: (items: AdminPoemItem[], duplicateId: string) => void;
      error: string;
    }> = [
      {
        name: "missing",
        mutate: (items, duplicateId) => {
          items.find(({ id }) => id === duplicateId)!.id =
            "renamed-duplicate-target";
        },
        error: "duplicate target is missing or not ACTIVE",
      },
      {
        name: "inactive",
        mutate: (items, duplicateId) => {
          const duplicate = items.find(({ id }) => id === duplicateId)!;
          duplicate.status = "ARCHIVED";
          const replacement = structuredClone(duplicate);
          replacement.id = "replacement-active-poem";
          replacement.status = "ACTIVE";
          replacement.payload.author = "replacement author";
          items.push(replacement);
        },
        error: "duplicate target is missing or not ACTIVE",
      },
      {
        name: "identity",
        mutate: (items, duplicateId) => {
          items.find(({ id }) => id === duplicateId)!.payload.author =
            "drifted duplicate target";
        },
        error: "duplicate target identity does not match",
      },
    ];

    for (const scenario of scenarios) {
      const { checklistText, admin } = await executionSetup();
      const entry = parsePoemReview(checklistText).find(
        ({ decision }) => decision === "ARCHIVE_DUPLICATE",
      )!;
      admin.listOverride = (items, call) => {
        if (call === 3) scenario.mutate(items, String(entry.duplicateOf));
        return items;
      };
      const now = () => new Date("2026-10-08T00:00:00Z");

      const error = await captureExecutionError(
        applyPoemReview({ checklistText, admin, now }),
      );
      expect(error, scenario.name).toMatchObject({
        name: "PoemReviewExecutionError",
        report: {
          activated: 310,
          archived: 10,
          failed: 1,
          results: expect.arrayContaining([
            expect.objectContaining({ id: entry.id }),
          ]),
          failure: {
            phase: "postflight verification",
            id: entry.id,
            error: `postflight ${entry.id}: ${scenario.error}`,
          },
        },
      });
      expect(error.report.results, scenario.name).toHaveLength(320);
      expect(
        error.report.results.some(({ result }) => result === "FAILED"),
        scenario.name,
      ).toBe(false);
      expect(admin.actionCalls, scenario.name).toHaveLength(320);
    }
  });
});
