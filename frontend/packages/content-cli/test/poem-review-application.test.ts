import { describe, expect, it } from "vitest";
import type { GuwendaoPoemCandidate } from "../src/guwendao-poem-candidates";
import type { PoemReviewAdminPort } from "../src/poem-review-admin";
import {
  applyPoemReview,
  generatePoemReview,
} from "../src/poem-review-application";
import { sha256Text } from "../src/poem-identity";
import {
  type AdminPoemItem,
  parsePoemReview,
  serializePoemReview,
  type ValidationResponse,
} from "../src/poem-review";

function candidate(index: number): GuwendaoPoemCandidate {
  const sourceId = index.toString(16).padStart(12, "0");
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

function backendItem(
  value: GuwendaoPoemCandidate,
  overrides: Partial<AdminPoemItem> = {},
): AdminPoemItem {
  return {
    id: value.id,
    type: "POEM",
    status: "DRAFT",
    revision: 2,
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
  const candidates = Array.from({ length: 320 }, (_, index) => candidate(index));
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
  it("does no writes when any preflight item drifted", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.items.get("sc-gwd-000000000001")!.revision = 3;
    const now = () => new Date("2026-10-08T00:00:00Z");

    await expect(
      applyPoemReview({ checklistText, admin, now }),
    ).rejects.toMatchObject({
      report: {
        activated: 0,
        archived: 0,
        skipped: 0,
        failed: 1,
      },
    });
    expect(admin.actionCalls).toEqual([]);
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
      admin.actionCalls.every(({ expectedRevision }) => expectedRevision === 2),
    ).toBe(true);
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
          throw new Error("HTTP 409 CONTENT_REVISION_CONFLICT");
        },
      },
      {
        name: "422 validation",
        fail: async () => {
          throw new Error("HTTP 422 CONTENT_VALIDATION_FAILED");
        },
      },
      {
        name: "403 permission",
        fail: async () => {
          throw new Error("HTTP 403 FORBIDDEN");
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

    for (const mutation of mutations) {
      const { checklistText, admin } = await executionSetup();
      const firstActivation = parsePoemReview(checklistText).find(
        ({ decision }) => decision === "ACTIVATE",
      )!.id;
      admin.actionOverride = async (action, item) => {
        item.status = action === "activate" ? "ACTIVE" : "ARCHIVED";
        const response = structuredClone(item);
        if (item.id === firstActivation) mutation.mutate(response);
        return response;
      };
      const now = () => new Date("2026-10-08T00:00:00Z");
      let thrown: unknown;
      try {
        await applyPoemReview({ checklistText, admin, now });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, mutation.name).toMatchObject({
        report: {
          activated: 0,
          archived: 10,
          failed: 1,
        },
      });
      expect(admin.actionCalls, mutation.name).toHaveLength(11);
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
          items.push({
            ...structuredClone(items.find(({ status }) => status === "ACTIVE")!),
            id: "extra-active-poem",
          });
        },
      },
      {
        name: "active candidate count",
        mutate: (items) => {
          items.find(
            ({ id, status }) => id.startsWith("sc-gwd-") && status === "ACTIVE",
          )!.id = "renamed-active-candidate";
        },
      },
      {
        name: "archived candidate count",
        mutate: (items) => {
          items.find(
            ({ id, status }) =>
              id.startsWith("sc-gwd-") && status === "ARCHIVED",
          )!.id = "renamed-archived-candidate";
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
      let thrown: unknown;
      try {
        await applyPoemReview({ checklistText, admin, now });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, scenario.name).toMatchObject({
        report: {
          activated: 310,
          archived: 10,
          failed: 1,
          verification: expect.any(Object),
        },
      });
      expect(admin.actionCalls, scenario.name).toHaveLength(320);
    }
  });

  it("reports checklist and preflight port failures without writing", async () => {
    const malformed = await executionSetup();
    const listFailure = await executionSetup();
    listFailure.admin.listOverride = (_items, call) => {
      if (call === 2) throw new Error("catalog unavailable");
      return _items;
    };
    const validationFailure = await executionSetup();
    validationFailure.admin.validateOverride = async () => {
      throw new Error("validation unavailable");
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
      message: expect.stringContaining("archive transport failure"),
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

  it("preserves completed actions when the postflight snapshot fails", async () => {
    const { checklistText, admin } = await executionSetup();
    admin.listOverride = (items, call) => {
      if (call === 3) throw new Error("postflight unavailable");
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
});
