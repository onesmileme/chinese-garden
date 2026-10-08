import { describe, expect, it } from "vitest";
import type { GuwendaoPoemCandidate } from "../src/guwendao-poem-candidates";
import { sha256Text } from "../src/poem-identity";
import {
  type AdminPoemItem,
  type PoemReviewEntry,
  classifyPoemReview,
  finalizePoemReview,
  parsePoemReview,
  serializePoemReview,
  serializePoemReviewSummary,
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

function candidateNdjson(candidates: readonly GuwendaoPoemCandidate[]): string {
  return `${candidates.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function happyFixture(): {
  candidates: GuwendaoPoemCandidate[];
  candidateText: string;
  catalog: AdminPoemItem[];
} {
  const candidates = Array.from({ length: 320 }, (_, index) => candidate(index));
  const candidateText = candidateNdjson(candidates);
  const activePoems = candidates.slice(0, 10).map((value, index) =>
    backendItem(value, {
      id: `poem-active-${index.toString().padStart(2, "0")}`,
      status: "ACTIVE",
      revision: 7,
    }),
  );
  return {
    candidates,
    candidateText,
    catalog: [
      ...activePoems,
      ...candidates.map((value) => backendItem(value)),
      backendItem(candidate(900), { id: "poem-unrelated-draft" }),
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function candidateFailureInput(
  mutate: (value: Record<string, unknown>) => void,
): ReturnType<typeof happyFixture> & { expectedCandidateSha256: string } {
  const fixture = happyFixture();
  mutate(asRecord(fixture.candidates[0]));
  fixture.candidateText = candidateNdjson(fixture.candidates);
  return {
    ...fixture,
    expectedCandidateSha256: sha256Text(fixture.candidateText),
  };
}

function classifiedFixture() {
  const fixture = happyFixture();
  return classifyPoemReview({
    candidateText: fixture.candidateText,
    catalog: fixture.catalog,
    expectedCandidateSha256: sha256Text(fixture.candidateText),
  });
}

function validResponses(
  classified: ReturnType<typeof classifiedFixture>,
): Map<string, { valid: true; issues: [] }> {
  return new Map(
    classified.entries
      .filter(({ decision }) => decision === "ACTIVATE")
      .map(({ id }) => [id, { valid: true, issues: [] }] as const),
  );
}

function finalizedEntries(): PoemReviewEntry[] {
  const classified = classifiedFixture();
  return finalizePoemReview(classified, validResponses(classified));
}

function checklistText(entries: readonly unknown[]): string {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

describe("poem review classification", () => {
  it("builds a stable 320-entry review with exactly 310 activations and 10 archives", () => {
    const fixture = happyFixture();
    const classified = classifyPoemReview({
      candidateText: fixture.candidateText,
      catalog: fixture.catalog,
      expectedCandidateSha256: sha256Text(fixture.candidateText),
    });
    const validations = new Map(
      classified.entries
        .filter(({ decision }) => decision === "ACTIVATE")
        .map(({ id }) => [id, { valid: true, issues: [] }] as const),
    );

    const entries = finalizePoemReview(classified, validations);

    expect(entries).toHaveLength(320);
    expect(entries.filter(({ decision }) => decision === "ACTIVATE"))
      .toHaveLength(310);
    expect(entries.filter(({ decision }) => decision === "ARCHIVE_DUPLICATE"))
      .toHaveLength(10);
    expect(entries.map(({ id }) => id)).toEqual(
      [...entries.map(({ id }) => id)].sort(),
    );
    expect(classified.candidateSha256).toBe(
      sha256Text(fixture.candidateText),
    );
    expect(entries[0]).toMatchObject({
      sourceHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
      payloadHash:
        "88b07fc6e01e4e7de77de136ed2b822064eece675094b3b55483e26ac1d2b2f2",
      poemIdentityHash:
        "aa77dbb14d3bf35c40b99babb22aedced5f4708e4517c8d4663ba2e0edabad92",
      duplicateOf: "poem-active-00",
    });
    expect(parsePoemReview(serializePoemReview(entries))).toEqual(entries);
  });

  it.each([
    {
      name: "wrong candidate count",
      arrange: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates.pop();
        fixture.candidateText = candidateNdjson(fixture.candidates);
        return {
          ...fixture,
          expectedCandidateSha256: sha256Text(fixture.candidateText),
        };
      },
      message: "candidate file must contain exactly 320 records",
    },
    {
      name: "candidate hash drift",
      arrange: (fixture: ReturnType<typeof happyFixture>) => ({
        ...fixture,
        expectedCandidateSha256: "0".repeat(64),
      }),
      message: "candidate SHA-256 mismatch",
    },
    {
      name: "malformed NDJSON",
      arrange: (fixture: ReturnType<typeof happyFixture>) => ({
        ...fixture,
        candidateText: `${fixture.candidateText.split("\n")[0]}\n{\n`,
        expectedCandidateSha256: sha256Text(
          `${fixture.candidateText.split("\n")[0]}\n{\n`,
        ),
      }),
      message: "candidate line 2 must be valid JSON",
    },
    {
      name: "non-object candidate",
      arrange: (fixture: ReturnType<typeof happyFixture>) => {
        const lines = fixture.candidateText.trimEnd().split("\n");
        lines[0] = "null";
        const candidateText = `${lines.join("\n")}\n`;
        return {
          ...fixture,
          candidateText,
          expectedCandidateSha256: sha256Text(candidateText),
        };
      },
      message: "candidate line 1 must be an object",
    },
    {
      name: "mixed rule version",
      arrange: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates[0]!.ruleVersion =
          "guwendao-tang-poem-v1" as "guwendao-tang-poem-v2";
        fixture.candidateText = candidateNdjson(fixture.candidates);
        return {
          ...fixture,
          expectedCandidateSha256: sha256Text(fixture.candidateText),
        };
      },
      message:
        "candidate line 1.ruleVersion must be guwendao-tang-poem-v2",
    },
    {
      name: "mixed source",
      arrange: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates[0]!.source =
          "OTHER" as GuwendaoPoemCandidate["source"];
        fixture.candidateText = candidateNdjson(fixture.candidates);
        return {
          ...fixture,
          expectedCandidateSha256: sha256Text(fixture.candidateText),
        };
      },
      message: "candidate line 1.source must be GUWENDAO_TANG",
    },
  ])("rejects $name", ({ arrange, message }) => {
    const input = arrange(happyFixture());

    expect(() =>
      classifyPoemReview({
        candidateText: input.candidateText,
        catalog: input.catalog,
        expectedCandidateSha256: input.expectedCandidateSha256,
      }),
    ).toThrow(message);
  });

  it.each([
    {
      name: "missing field",
      mutate: (value: Record<string, unknown>) => {
        delete value.importKey;
      },
      message: "candidate line 1.importKey is required",
    },
    {
      name: "extra field",
      mutate: (value: Record<string, unknown>) => {
        value.unexpected = true;
      },
      message: "candidate line 1.unexpected is not allowed",
    },
    {
      name: "invalid import key",
      mutate: (value: Record<string, unknown>) => {
        value.importKey = "GUWENDAO_TANG:wrong";
      },
      message: "candidate line 1.importKey does not match sourceId",
    },
    {
      name: "invalid source ref",
      mutate: (value: Record<string, unknown>) => {
        value.sourceRef = "https://example.com";
      },
      message: "candidate line 1.sourceRef does not match payload.source.sourceUrl",
    },
    {
      name: "invalid source hash",
      mutate: (value: Record<string, unknown>) => {
        value.sourceHash = "not-a-hash";
      },
      message: "candidate line 1.sourceHash must be a lowercase SHA-256",
    },
    {
      name: "invalid id",
      mutate: (value: Record<string, unknown>) => {
        value.id = "sc-gwd-wrong";
      },
      message: "candidate line 1.id does not match sourceId",
    },
    {
      name: "invalid type",
      mutate: (value: Record<string, unknown>) => {
        value.type = "IDIOM";
      },
      message: "candidate line 1.type must be POEM",
    },
    {
      name: "invalid level",
      mutate: (value: Record<string, unknown>) => {
        value.suggestedLevel = 4;
      },
      message: "candidate line 1.suggestedLevel must be 5",
    },
    {
      name: "invalid difficulty",
      mutate: (value: Record<string, unknown>) => {
        value.suggestedDifficulty = 4;
      },
      message: "candidate line 1.suggestedDifficulty must be 5",
    },
    {
      name: "invalid promotion flag",
      mutate: (value: Record<string, unknown>) => {
        value.promotionRequired = false;
      },
      message: "candidate line 1.promotionRequired must be true",
    },
    {
      name: "non-array tags",
      mutate: (value: Record<string, unknown>) => {
        value.tags = "唐诗";
      },
      message: "candidate line 1.tags must be an array",
    },
    {
      name: "invalid tags",
      mutate: (value: Record<string, unknown>) => {
        value.tags = ["唐诗", "古文岛", "错误分类"];
      },
      message: "candidate line 1.tags must match the source category",
    },
    {
      name: "invalid payload",
      mutate: (value: Record<string, unknown>) => {
        value.payload = null;
      },
      message: "candidate line 1.payload must be an object",
    },
    {
      name: "non-string title",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).title = 42;
      },
      message: "candidate line 1.payload.title must be a string",
    },
    {
      name: "empty title",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).title = "";
      },
      message: "candidate line 1.payload.title must not be empty",
    },
    {
      name: "empty author",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).author = "";
      },
      message: "candidate line 1.payload.author must not be empty",
    },
    {
      name: "non-array lines",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).lines = "正文";
      },
      message: "candidate line 1.payload.lines must be a non-empty array",
    },
    {
      name: "empty lines",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).lines = [];
      },
      message: "candidate line 1.payload.lines must be a non-empty array",
    },
    {
      name: "empty line",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).lines = [""];
      },
      message: "candidate line 1.payload.lines[0] must not be empty",
    },
    {
      name: "non-array charRefs",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).charRefs = null;
      },
      message: "candidate line 1.payload.charRefs must be an empty array",
    },
    {
      name: "non-empty charRefs",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).charRefs = ["hz-test"];
      },
      message: "candidate line 1.payload.charRefs must be an empty array",
    },
    {
      name: "invalid payload source",
      mutate: (value: Record<string, unknown>) => {
        asRecord(value.payload).source = [];
      },
      message: "candidate line 1.payload.source must be an object",
    },
    {
      name: "invalid source id",
      mutate: (value: Record<string, unknown>) => {
        asRecord(asRecord(value.payload).source).sourceId = "INVALID";
      },
      message:
        "candidate line 1.payload.source.sourceId must be 12 lowercase hex characters",
    },
    {
      name: "invalid dynasty",
      mutate: (value: Record<string, unknown>) => {
        asRecord(asRecord(value.payload).source).dynasty = "宋代";
      },
      message: "candidate line 1.payload.source.dynasty must be 唐代",
    },
    {
      name: "empty category",
      mutate: (value: Record<string, unknown>) => {
        asRecord(asRecord(value.payload).source).category = "";
      },
      message: "candidate line 1.payload.source.category must not be empty",
    },
    {
      name: "invalid source URL",
      mutate: (value: Record<string, unknown>) => {
        asRecord(asRecord(value.payload).source).sourceUrl =
          "https://example.com";
      },
      message: "candidate line 1.payload.source.sourceUrl does not match sourceId",
    },
    {
      name: "invalid score",
      mutate: (value: Record<string, unknown>) => {
        value.score = 99;
      },
      message: "candidate line 1.score must be 100",
    },
  ])("validates every candidate field: $name", ({ mutate, message }) => {
    const input = candidateFailureInput(mutate);

    expect(() =>
      classifyPoemReview({
        candidateText: input.candidateText,
        catalog: input.catalog,
        expectedCandidateSha256: input.expectedCandidateSha256,
      }),
    ).toThrow(message);
  });

  it.each([
    {
      name: "candidate ID",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates[1]!.id = fixture.candidates[0]!.id;
        fixture.candidates[1]!.payload.source.sourceId =
          fixture.candidates[0]!.payload.source.sourceId;
        fixture.candidates[1]!.importKey = fixture.candidates[0]!.importKey;
        fixture.candidates[1]!.sourceRef = fixture.candidates[0]!.sourceRef;
        fixture.candidates[1]!.payload.source.sourceUrl =
          fixture.candidates[0]!.payload.source.sourceUrl;
      },
      message: "duplicate candidate ID: sc-gwd-000000000000",
    },
    {
      name: "author and title",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates[1]!.payload.author =
          fixture.candidates[0]!.payload.author;
        fixture.candidates[1]!.payload.title =
          fixture.candidates[0]!.payload.title;
      },
      message: "duplicate candidate author and title",
    },
    {
      name: "poem identity",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.candidates[1]!.payload.author =
          ` ${fixture.candidates[0]!.payload.author} `;
        fixture.candidates[1]!.payload.lines =
          fixture.candidates[0]!.payload.lines.map((line) => ` ${line}`);
      },
      message: "duplicate candidate poem identity",
    },
  ])("rejects duplicate $name", ({ mutate, message }) => {
    const fixture = happyFixture();
    mutate(fixture);
    fixture.candidateText = candidateNdjson(fixture.candidates);

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(message);
  });

  it.each([
    ["author", (value: GuwendaoPoemCandidate) => {
      value.payload.author = "李\u0000白";
    }],
    ["body", (value: GuwendaoPoemCandidate) => {
      value.payload.lines = ["白\u0000月"];
    }],
  ] as const)("propagates the poem identity %s NUL error", (part, mutate) => {
    const fixture = happyFixture();
    mutate(fixture.candidates[0]!);
    fixture.candidateText = candidateNdjson(fixture.candidates);

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      `poem identity ${part} must not contain U+0000 after normalization`,
    );
  });

  it.each([
    {
      name: "missing backend item",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog = fixture.catalog.filter(
          ({ id }) => id !== fixture.candidates[20]!.id,
        );
      },
      message: "backend item missing: sc-gwd-000000000014",
    },
    {
      name: "duplicate backend ID",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog.push(structuredClone(fixture.catalog[10]!));
      },
      message: "duplicate backend item ID: sc-gwd-000000000000",
    },
    {
      name: "non-draft backend item",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.status = "ARCHIVED";
      },
      message: "backend item sc-gwd-00000000000a.status must be DRAFT",
    },
    {
      name: "revision drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.revision = 3;
      },
      message: "backend item sc-gwd-00000000000a.revision must be 2",
    },
    {
      name: "type drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.type =
          "IDIOM" as AdminPoemItem["type"];
      },
      message: "backend item sc-gwd-00000000000a.type must be POEM",
    },
    {
      name: "level drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.level = "L4";
      },
      message: "backend item sc-gwd-00000000000a.level does not match candidate",
    },
    {
      name: "difficulty drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.difficulty = "L4";
      },
      message:
        "backend item sc-gwd-00000000000a.difficulty does not match candidate",
    },
    {
      name: "promotion drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.promotionRequired = false;
      },
      message:
        "backend item sc-gwd-00000000000a.promotionRequired does not match candidate",
    },
    {
      name: "tags drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.tags = ["唐诗"];
      },
      message: "backend item sc-gwd-00000000000a.tags do not match candidate",
    },
    {
      name: "payload drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.payload.title = "漂移标题";
      },
      message: "backend item sc-gwd-00000000000a.payload does not match candidate",
    },
  ])("rejects $name", ({ mutate, message }) => {
    const fixture = happyFixture();
    mutate(fixture);

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(message);
  });

  it("rejects a candidate that matches multiple active poems", () => {
    const fixture = happyFixture();
    fixture.catalog.push(
      backendItem(fixture.candidates[0]!, {
        id: "poem-active-second-match",
        status: "ACTIVE",
        revision: 9,
      }),
    );

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      "candidate sc-gwd-000000000000 matches more than one ACTIVE poem",
    );
  });

  it.each([
    ["zero", 0, "320 ACTIVATE and 0 ARCHIVE_DUPLICATE"],
    ["nine", 9, "311 ACTIVATE and 9 ARCHIVE_DUPLICATE"],
    ["eleven", 11, "309 ACTIVATE and 11 ARCHIVE_DUPLICATE"],
  ] as const)(
    "rejects $name active duplicate targets because decision counts are not 310/10",
    (_name, activeCount, actualCounts) => {
      const fixture = happyFixture();
      const draftStart = 10;
      const activePoems = fixture.catalog.slice(
        0,
        Math.min(activeCount, draftStart),
      );
      if (activeCount === 11) {
        activePoems.push(
          backendItem(fixture.candidates[10]!, {
            id: "poem-active-10",
            status: "ACTIVE",
            revision: 7,
          }),
        );
      }
      fixture.catalog = [
        ...activePoems,
        ...fixture.catalog.slice(draftStart),
      ];

      expect(() =>
        classifyPoemReview({
          candidateText: fixture.candidateText,
          catalog: fixture.catalog,
          expectedCandidateSha256: sha256Text(fixture.candidateText),
        }),
      ).toThrow(
        `review decisions must be exactly 310 ACTIVATE and 10 ARCHIVE_DUPLICATE; received ${actualCounts}`,
      );
    },
  );

  it("propagates invalid canonical backend payload errors", () => {
    const fixture = happyFixture();
    fixture.catalog[20]!.payload.title = undefined as unknown as string;

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      "canonicalJsonSha256 only accepts valid JSON values; received undefined at $.title",
    );
  });

  it("propagates NUL errors from active poem identities", () => {
    const fixture = happyFixture();
    fixture.catalog[0]!.payload.author = "李\u0000白";

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      "poem identity author must not contain U+0000 after normalization",
    );
  });
});

describe("poem review finalization", () => {
  it("adds fixed decision-specific checks without mutating classification", () => {
    const classified = classifiedFixture();
    const before = structuredClone(classified);

    const entries = finalizePoemReview(
      classified,
      validResponses(classified),
    );

    expect(classified).toEqual(before);
    expect(entries.find(({ decision }) => decision === "ACTIVATE")!.checks)
      .toEqual([
        "SOURCE_MATCH",
        "FIELDS_COMPLETE",
        "CANDIDATE_TITLE_UNIQUE",
        "CANDIDATE_BODY_UNIQUE",
        "BACKEND_PAYLOAD_MATCH",
        "CONTENT_VALID",
      ]);
    expect(
      entries.find(
        ({ decision }) => decision === "ARCHIVE_DUPLICATE",
      )!.checks,
    ).toEqual([
      "SOURCE_MATCH",
      "FIELDS_COMPLETE",
      "CANDIDATE_TITLE_UNIQUE",
      "CANDIDATE_BODY_UNIQUE",
      "BACKEND_PAYLOAD_MATCH",
      "ACTIVE_DUPLICATE_CONFIRMED",
    ]);
  });

  it.each([
    {
      name: "missing",
      mutate: (
        classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        responses.delete(
          classified.entries.find(
            ({ decision }) => decision === "ACTIVATE",
          )!.id,
        );
      },
      message: "missing validation response for",
    },
    {
      name: "invalid",
      mutate: (
        classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        responses.set(
          classified.entries.find(
            ({ decision }) => decision === "ACTIVATE",
          )!.id,
          { valid: false, issues: [] },
        );
      },
      message: "must be valid with zero issues",
    },
    {
      name: "issue-bearing",
      mutate: (
        classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        const id = classified.entries.find(
          ({ decision }) => decision === "ACTIVATE",
        )!.id;
        responses.set(id, {
          valid: true,
          issues: [{
            code: "TEST",
            itemId: id,
            path: "/payload",
            message: "blocked",
          }],
        });
      },
      message: "must be valid with zero issues",
    },
    {
      name: "malformed",
      mutate: (
        classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        responses.set(
          classified.entries.find(
            ({ decision }) => decision === "ACTIVATE",
          )!.id,
          { valid: true, issues: null },
        );
      },
      message: "must be valid with zero issues",
    },
    {
      name: "archive",
      mutate: (
        classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        responses.set(
          classified.entries.find(
            ({ decision }) => decision === "ARCHIVE_DUPLICATE",
          )!.id,
          { valid: true, issues: [] },
        );
      },
      message: "unexpected validation response for",
    },
    {
      name: "unknown",
      mutate: (
        _classified: ReturnType<typeof classifiedFixture>,
        responses: Map<string, unknown>,
      ) => {
        responses.set("unknown-id", { valid: true, issues: [] });
      },
      message: "unexpected validation response for unknown-id",
    },
  ])("rejects a $name validation response", ({ mutate, message }) => {
    const classified = classifiedFixture();
    const responses = validResponses(classified) as Map<string, unknown>;
    mutate(classified, responses);

    expect(() =>
      finalizePoemReview(
        classified,
        responses as ReadonlyMap<string, never>,
      ),
    ).toThrow(message);
  });
});

describe("poem review checklist serialization", () => {
  it("emits canonical compact NDJSON in stable ID order with one terminal newline", () => {
    const entries = finalizedEntries();
    const reorderedObject = Object.fromEntries(
      Object.entries(entries[0]!).reverse(),
    ) as unknown as PoemReviewEntry;
    const shuffled = [
      ...entries.slice(1).reverse(),
      reorderedObject,
    ];

    const serialized = serializePoemReview(shuffled);

    expect(serialized).toBe(serializePoemReview(entries));
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(serialized.split("\n")).toHaveLength(321);
    expect(JSON.parse(serialized.split("\n")[0]!)).toEqual(entries[0]);
    expect(parsePoemReview(`\n${serialized}\n`)).toEqual(entries);
  });

  it("rejects duplicate IDs before serializing", () => {
    const entries = finalizedEntries();
    entries[1]!.id = entries[0]!.id;

    expect(() => serializePoemReview(entries)).toThrow(
      "duplicate checklist ID: sc-gwd-000000000000",
    );
  });

  it.each([
    {
      name: "malformed JSON",
      build: (_entries: PoemReviewEntry[]) => "{\n",
      message: "review line 1 must be valid JSON",
    },
    {
      name: "non-object line",
      build: (_entries: PoemReviewEntry[]) => "null\n",
      message: "review line 1 must be an object",
    },
    {
      name: "wrong count",
      build: (entries: PoemReviewEntry[]) => checklistText(entries.slice(1)),
      message: "checklist must contain exactly 320 entries",
    },
    {
      name: "unsorted IDs",
      build: (entries: PoemReviewEntry[]) => {
        [entries[0], entries[1]] = [entries[1]!, entries[0]!];
        return checklistText(entries);
      },
      message: "checklist IDs must be in ascending order",
    },
    {
      name: "duplicate ID",
      build: (entries: PoemReviewEntry[]) => {
        entries[1]!.id = entries[0]!.id;
        return checklistText(entries);
      },
      message: "duplicate checklist ID: sc-gwd-000000000000",
    },
    {
      name: "missing field",
      build: (entries: PoemReviewEntry[]) => {
        delete asRecord(entries[0]).author;
        return checklistText(entries);
      },
      message: "review line 1.author is required",
    },
    {
      name: "extra field",
      build: (entries: PoemReviewEntry[]) => {
        asRecord(entries[0]).unexpected = true;
        return checklistText(entries);
      },
      message: "review line 1.unexpected is not allowed",
    },
    {
      name: "empty ID",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.id = "";
        return checklistText(entries);
      },
      message: "review line 1.id must not be empty",
    },
    {
      name: "invalid revision",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.expectedRevision = 0;
        return checklistText(entries);
      },
      message: "review line 1.expectedRevision must be a positive integer",
    },
    {
      name: "invalid status",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.expectedStatus =
          "ACTIVE" as PoemReviewEntry["expectedStatus"];
        return checklistText(entries);
      },
      message: "review line 1.expectedStatus must be DRAFT",
    },
    {
      name: "empty title",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.title = "";
        return checklistText(entries);
      },
      message: "review line 1.title must not be empty",
    },
    {
      name: "non-string author",
      build: (entries: PoemReviewEntry[]) => {
        asRecord(entries[0]).author = 42;
        return checklistText(entries);
      },
      message: "review line 1.author must be a string",
    },
    {
      name: "invalid source ID",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.sourceId = "INVALID";
        return checklistText(entries);
      },
      message:
        "review line 1.sourceId must be 12 lowercase hex characters",
    },
    {
      name: "invalid source hash",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.sourceHash = "INVALID";
        return checklistText(entries);
      },
      message: "review line 1.sourceHash must be a lowercase SHA-256",
    },
    {
      name: "invalid payload hash",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.payloadHash = "INVALID";
        return checklistText(entries);
      },
      message: "review line 1.payloadHash must be a lowercase SHA-256",
    },
    {
      name: "invalid identity hash",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.poemIdentityHash = "INVALID";
        return checklistText(entries);
      },
      message:
        "review line 1.poemIdentityHash must be a lowercase SHA-256",
    },
    {
      name: "invalid decision",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.decision =
          "SKIP" as PoemReviewEntry["decision"];
        return checklistText(entries);
      },
      message: "review line 1.decision must be ACTIVATE or ARCHIVE_DUPLICATE",
    },
    {
      name: "non-array checks",
      build: (entries: PoemReviewEntry[]) => {
        asRecord(entries[0]).checks = null;
        return checklistText(entries);
      },
      message: "review line 1.checks must be an array",
    },
    {
      name: "wrong activation checks",
      build: (entries: PoemReviewEntry[]) => {
        entries[10]!.checks = [...entries[0]!.checks];
        return checklistText(entries);
      },
      message: "review line 11.checks do not match decision ACTIVATE",
    },
    {
      name: "activation duplicate target",
      build: (entries: PoemReviewEntry[]) => {
        entries[10]!.duplicateOf = "poem-active-00";
        return checklistText(entries);
      },
      message: "review line 11.duplicateOf must be null for ACTIVATE",
    },
    {
      name: "missing archive duplicate target",
      build: (entries: PoemReviewEntry[]) => {
        entries[0]!.duplicateOf = null;
        return checklistText(entries);
      },
      message:
        "review line 1.duplicateOf must be a non-empty string for ARCHIVE_DUPLICATE",
    },
    {
      name: "duplicate archive target",
      build: (entries: PoemReviewEntry[]) => {
        entries[1]!.duplicateOf = entries[0]!.duplicateOf;
        return checklistText(entries);
      },
      message: "duplicate ACTIVE target in checklist: poem-active-00",
    },
    {
      name: "wrong decision counts",
      build: (entries: PoemReviewEntry[]) => {
        entries[10]!.decision = "ARCHIVE_DUPLICATE";
        entries[10]!.checks = [
          "SOURCE_MATCH",
          "FIELDS_COMPLETE",
          "CANDIDATE_TITLE_UNIQUE",
          "CANDIDATE_BODY_UNIQUE",
          "BACKEND_PAYLOAD_MATCH",
          "ACTIVE_DUPLICATE_CONFIRMED",
        ];
        entries[10]!.duplicateOf = "poem-active-extra";
        return checklistText(entries);
      },
      message:
        "checklist decisions must be exactly 310 ACTIVATE and 10 ARCHIVE_DUPLICATE",
    },
  ])("rejects $name", ({ build, message }) => {
    expect(() => parsePoemReview(build(finalizedEntries()))).toThrow(message);
  });

  it("serializes a deterministic summary from supplied hashes and sorted duplicate rows", () => {
    const entries = finalizedEntries();
    const candidateHash = "a".repeat(64);
    const checklistHash = "b".repeat(64);

    const first = serializePoemReviewSummary(
      entries,
      candidateHash,
      checklistHash,
    );
    const second = serializePoemReviewSummary(
      [...entries].reverse(),
      candidateHash,
      checklistHash,
    );

    expect(second).toBe(first);
    expect(first).toContain(
      `- Candidate SHA-256: \`${candidateHash}\`\n- Checklist SHA-256: \`${checklistHash}\``,
    );
    expect(first).toContain(
      "| sc-gwd-000000000000 | 测试诗 0 | 作者 0 | poem-active-00 |",
    );
    expect(first).not.toMatch(/generated|timestamp|2026/i);
    expect(first.endsWith("\n")).toBe(true);
  });

  it.each([
    ["candidate", "invalid", "a".repeat(64)],
    ["checklist", "a".repeat(64), "invalid"],
  ])("rejects an invalid %s summary hash", (_name, candidateHash, checklistHash) => {
    expect(() =>
      serializePoemReviewSummary(
        finalizedEntries(),
        candidateHash,
        checklistHash,
      ),
    ).toThrow("summary hashes must be lowercase SHA-256");
  });
});
