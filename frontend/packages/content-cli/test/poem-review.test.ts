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

function candidateNdjson(candidates: readonly GuwendaoPoemCandidate[]): string {
  return `${candidates.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function happyFixture(): {
  candidates: GuwendaoPoemCandidate[];
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
  const candidateText = candidateNdjson(candidates);
  const activePoems = candidates.slice(0, 10).map((value, index) =>
    backendItem(value, {
      id: `poem-active-${index.toString().padStart(2, "0")}`,
      status: "ACTIVE",
      revision: 7,
    }),
  );
  const nonMatchingActivePoems = candidates.slice(10, 23).map((value, index) =>
    backendItem(value, {
      id: `poem-active-${(index + 10).toString().padStart(2, "0")}`,
      status: "ACTIVE",
      revision: 7,
      payload: {
        ...structuredClone(value.payload),
        lines: [`不同正文 ${index}，第一句。`, `不同正文 ${index}，第二句。`],
      },
    }),
  );
  return {
    candidates,
    candidateText,
    catalog: [
      ...activePoems,
      ...candidates.map((value) => backendItem(value)),
      ...nonMatchingActivePoems,
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

function coercionProbe(): {
  value: object;
  getterCalls: () => number;
} {
  let calls = 0;
  const value = {};
  Object.defineProperty(value, Symbol.toPrimitive, {
    get: () => {
      calls += 1;
      return () => "a".repeat(64);
    },
  });
  return {
    value,
    getterCalls: () => calls,
  };
}

describe("poem review classification", () => {
  it.each([
    ["undefined", undefined, "must be a valid JSON value"],
    ["bigint", 1n, "must be a valid JSON value"],
    ["symbol", Symbol("hash"), "must be a valid JSON value"],
    ["function", () => "hash", "must be a valid JSON value"],
    ["NaN", Number.NaN, "must be a finite number"],
    ["Infinity", Number.POSITIVE_INFINITY, "must be a finite number"],
    ["-Infinity", Number.NEGATIVE_INFINITY, "must be a finite number"],
  ] as const)("rejects %s before hashing", (_name, value, message) => {
    const fixture = happyFixture();
    const input = {
      candidateText: fixture.candidateText,
      catalog: fixture.catalog,
      expectedCandidateSha256: value,
    } as unknown as Parameters<typeof classifyPoemReview>[0];

    expect(() => classifyPoemReview(input)).toThrow(
      `review input.expectedCandidateSha256 ${message}`,
    );
  });

  it("rejects a review input with a custom prototype", () => {
    const fixture = happyFixture();
    const input = Object.assign(Object.create({ inherited: true }), {
      candidateText: fixture.candidateText,
      catalog: fixture.catalog,
      expectedCandidateSha256: sha256Text(fixture.candidateText),
    }) as Parameters<typeof classifyPoemReview>[0];

    expect(() => classifyPoemReview(input)).toThrow(
      "review input must be a plain JSON object",
    );
  });

  it("rejects an enumerable accessor without executing its getter", () => {
    const fixture = happyFixture();
    let getterCalls = 0;
    const input = {
      catalog: fixture.catalog,
      expectedCandidateSha256: sha256Text(fixture.candidateText),
    } as Partial<Parameters<typeof classifyPoemReview>[0]>;
    Object.defineProperty(input, "candidateText", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return fixture.candidateText;
      },
    });

    expect(() =>
      classifyPoemReview(
        input as Parameters<typeof classifyPoemReview>[0],
      ),
    ).toThrow(
      "review input.candidateText must be an enumerable data property",
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects a nested catalog accessor before classification reads it", () => {
    const fixture = happyFixture();
    let getterCalls = 0;
    Object.defineProperty(fixture.catalog[0], "id", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "poem-active-00";
      },
    });

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      "review input.catalog[0].id must be an enumerable data property",
    );
    expect(getterCalls).toBe(0);
  });

  it("accepts a review input whose prototype is null", () => {
    const fixture = happyFixture();
    const input = Object.assign(Object.create(null), {
      candidateText: fixture.candidateText,
      catalog: fixture.catalog,
      expectedCandidateSha256: sha256Text(fixture.candidateText),
    }) as Parameters<typeof classifyPoemReview>[0];

    expect(classifyPoemReview(input).entries).toHaveLength(320);
  });

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

    expect(fixture.catalog.filter(({ status }) => status === "ACTIVE"))
      .toHaveLength(23);
    expect(entries).toHaveLength(320);
    expect(entries.filter(({ decision }) => decision === "ACTIVATE"))
      .toHaveLength(310);
    expect(entries.filter(({ decision }) => decision === "ARCHIVE_DUPLICATE"))
      .toHaveLength(10);
    expect(
      entries.slice(10, 23).map(({ decision, duplicateOf }) => ({
        decision,
        duplicateOf,
      })),
    ).toEqual(
      Array.from({ length: 13 }, () => ({
        decision: "ACTIVATE",
        duplicateOf: null,
      })),
    );
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

  it("pins each expected revision from a mixed backend snapshot", () => {
    const fixture = happyFixture();

    const classified = classifyPoemReview({
      candidateText: fixture.candidateText,
      catalog: fixture.catalog,
      expectedCandidateSha256: sha256Text(fixture.candidateText),
    });
    const revisionById = new Map(
      classified.entries.map(({ id, expectedRevision }) => [
        id,
        expectedRevision,
      ]),
    );

    expect(
      Object.fromEntries(
        [
          "sc-gwd-000000000000",
          ...TITLE_DISAMBIGUATED_CANDIDATE_IDS,
        ].map((id) => [id, revisionById.get(id)]),
      ),
    ).toEqual({
      "sc-gwd-000000000000": 1,
      "sc-gwd-05c6c4ccf634": 2,
      "sc-gwd-09fd71c77ec7": 2,
      "sc-gwd-0c472e85a3ad": 2,
      "sc-gwd-2d27cb0ecae4": 2,
    });
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
      name: "ordinary candidate revision drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog[20]!.revision = 2;
      },
      message: "backend item sc-gwd-00000000000a.revision must be 1",
    },
    {
      name: "title-disambiguated candidate revision drift",
      mutate: (fixture: ReturnType<typeof happyFixture>) => {
        fixture.catalog.find(
          ({ id }) => id === TITLE_DISAMBIGUATED_CANDIDATE_IDS[0],
        )!.revision = 1;
      },
      message:
        "backend item sc-gwd-05c6c4ccf634.revision must be 2",
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
            id: "poem-active-extra-match",
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

  it("rejects invalid backend payload primitives before hashing", () => {
    const fixture = happyFixture();
    fixture.catalog[20]!.payload.title = undefined as unknown as string;

    expect(() =>
      classifyPoemReview({
        candidateText: fixture.candidateText,
        catalog: fixture.catalog,
        expectedCandidateSha256: sha256Text(fixture.candidateText),
      }),
    ).toThrow(
      "review input.catalog[20].payload.title must be a valid JSON value",
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

  it("does not read an own entries getter on a validation Map", () => {
    const classified = classifiedFixture();
    const responses = validResponses(classified);
    let getterCalls = 0;
    Object.defineProperty(responses, "entries", {
      get: () => {
        getterCalls += 1;
        throw new Error("entries getter must not run");
      },
    });

    const entries = finalizePoemReview(classified, responses);

    expect(entries).toHaveLength(320);
    expect(getterCalls).toBe(0);
  });

  it("clearly rejects a non-Map object that exposes entries", () => {
    const classified = classifiedFixture();
    const fakeMap = {
      entries: Map.prototype.entries,
    } as unknown as Parameters<typeof finalizePoemReview>[1];

    expect(() => finalizePoemReview(classified, fakeMap)).toThrow(
      "validation responses must be a Map",
    );
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

  it("rejects non-enumerable validation response properties", () => {
    const classified = classifiedFixture();
    const responses = validResponses(classified) as Map<string, unknown>;
    const id = classified.entries.find(
      ({ decision }) => decision === "ACTIVATE",
    )!.id;
    Object.defineProperty(responses.get(id), "hidden", {
      value: true,
    });

    expect(() =>
      finalizePoemReview(
        classified,
        responses as ReadonlyMap<string, never>,
      ),
    ).toThrow(
      `validation response for ${id}.hidden must be an enumerable data property`,
    );
  });

  it("rejects symbol properties in the classified review", () => {
    const classified = classifiedFixture();
    Object.assign(classified.entries[0]!, {
      [Symbol("hidden")]: true,
    });

    expect(() =>
      finalizePoemReview(classified, validResponses(classified)),
    ).toThrow(
      "classified review.entries[0] must not contain symbol properties",
    );
  });

  it("rejects invalid candidateSha256 values without coercion", () => {
    const symbolClassified = classifiedFixture();
    symbolClassified.candidateSha256 =
      Symbol("hash") as unknown as string;
    expect(() =>
      finalizePoemReview(
        symbolClassified,
        validResponses(symbolClassified),
      ),
    ).toThrow(
      "classified review.candidateSha256 must be a valid JSON value",
    );

    const objectClassified = classifiedFixture();
    const probe = coercionProbe();
    objectClassified.candidateSha256 =
      probe.value as unknown as string;
    expect(() =>
      finalizePoemReview(
        objectClassified,
        validResponses(objectClassified),
      ),
    ).toThrow(
      "classified review.candidateSha256 must not contain symbol properties",
    );
    expect(probe.getterCalls()).toBe(0);
  });

  it("validates every response key before error-message coercion", () => {
    const classified = classifiedFixture();
    const responses = validResponses(classified) as Map<unknown, unknown>;
    const probe = coercionProbe();
    responses.set(probe.value, { valid: true, issues: [] });
    let thrown: unknown;

    try {
      finalizePoemReview(
        classified,
        responses as Parameters<typeof finalizePoemReview>[1],
      );
    } catch (error) {
      thrown = error;
    }

    expect([
      thrown instanceof Error ? thrown.message : null,
      probe.getterCalls(),
    ]).toEqual([
      "validation response key 311 must not contain symbol properties",
      0,
    ]);
  });
});

describe("poem review checklist serialization", () => {
  it("rejects a Symbol review text before reading string methods", () => {
    expect(() =>
      parsePoemReview(Symbol("text") as unknown as string),
    ).toThrow("review text must be a valid JSON value");
  });

  it("rejects a finite non-string review text", () => {
    expect(() =>
      parsePoemReview(42 as unknown as string),
    ).toThrow("review text must be a string");
  });

  it("validates review text before reading string methods", () => {
    const probe = coercionProbe();
    let thrown: unknown;

    try {
      parsePoemReview(probe.value as string);
    } catch (error) {
      thrown = error;
    }

    expect([
      thrown instanceof Error ? thrown.message : null,
      probe.getterCalls(),
    ]).toEqual([
      "review text must not contain symbol properties",
      0,
    ]);
  });

  it("rejects an entries array with extra properties", () => {
    const entries = finalizedEntries();
    Object.assign(entries, { extra: true });

    expect(() => serializePoemReview(entries)).toThrow(
      "review entries must not contain non-index properties",
    );
  });

  it("rejects sparse entries arrays", () => {
    const entries = finalizedEntries();
    delete entries[0];

    expect(() => serializePoemReview(entries)).toThrow(
      "review entries must not be sparse",
    );
  });

  it("rejects arrays with custom prototypes", () => {
    const entries = finalizedEntries();
    Object.setPrototypeOf(entries, Object.create(Array.prototype));

    expect(() => serializePoemReview(entries)).toThrow(
      "review entries must be a plain JSON array",
    );
  });

  it("rejects symbol properties on arrays", () => {
    const entries = finalizedEntries();
    Object.assign(entries, { [Symbol("hidden")]: true });

    expect(() =>
      serializePoemReviewSummary(
        entries,
        "a".repeat(64),
        "b".repeat(64),
      ),
    ).toThrow("review entries must not contain symbol properties");
  });

  it("rejects array accessors without executing their getters", () => {
    const entries = finalizedEntries();
    let getterCalls = 0;
    Object.defineProperty(entries[0]!.checks, "0", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "SOURCE_MATCH";
      },
    });

    expect(() => serializePoemReview(entries)).toThrow(
      "review entries[0].checks[0] must be an enumerable data property",
    );
    expect(getterCalls).toBe(0);
  });

  it("validates every entry field before coercion", () => {
    const symbolEntries = finalizedEntries();
    symbolEntries[0]!.payloadHash =
      Symbol("hash") as unknown as string;
    expect(() => serializePoemReview(symbolEntries)).toThrow(
      "review entries[0].payloadHash must be a valid JSON value",
    );

    const objectEntries = finalizedEntries();
    const probe = coercionProbe();
    objectEntries.at(-1)!.id = probe.value as unknown as string;
    expect(() => serializePoemReview(objectEntries)).toThrow(
      "review entries[319].id must not contain symbol properties",
    );
    expect(probe.getterCalls()).toBe(0);
  });

  it("rejects symbol and non-enumerable review entry properties", () => {
    const symbolEntries = finalizedEntries();
    Object.assign(symbolEntries[0]!, { [Symbol("hidden")]: true });
    expect(() => serializePoemReview(symbolEntries)).toThrow(
      "review entries[0] must not contain symbol properties",
    );

    const hiddenEntries = finalizedEntries();
    Object.defineProperty(hiddenEntries[0], "hidden", { value: true });
    expect(() => serializePoemReview(hiddenEntries)).toThrow(
      "review entries[0].hidden must be an enumerable data property",
    );
  });

  it("rejects circular review objects", () => {
    const entries = finalizedEntries();
    Object.assign(entries[0]!, { self: entries[0] });

    expect(() => serializePoemReview(entries)).toThrow(
      "review entries[0].self must not contain circular references",
    );
  });

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
    expect(serializePoemReview(entries)).toBe(serializePoemReview(entries));
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

  it("validates the candidate summary hash before regex coercion", () => {
    const probe = coercionProbe();
    let thrown: unknown;

    try {
      serializePoemReviewSummary(
        finalizedEntries(),
        probe.value as string,
        "b".repeat(64),
      );
    } catch (error) {
      thrown = error;
    }

    expect([
      thrown instanceof Error ? thrown.message : null,
      probe.getterCalls(),
    ]).toEqual([
      "summary candidate SHA-256 must not contain symbol properties",
      0,
    ]);
  });

  it("validates the checklist summary hash before regex coercion", () => {
    const probe = coercionProbe();

    expect(() =>
      serializePoemReviewSummary(
        finalizedEntries(),
        "a".repeat(64),
        probe.value as string,
      ),
    ).toThrow(
      "summary checklist SHA-256 must not contain symbol properties",
    );
    expect(probe.getterCalls()).toBe(0);

    expect(() =>
      serializePoemReviewSummary(
        finalizedEntries(),
        "a".repeat(64),
        Symbol("hash") as unknown as string,
      ),
    ).toThrow(
      "summary checklist SHA-256 must be a valid JSON value",
    );
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
    expect(first).toContain("- Pre-execution status: DRAFT (320)");
    expect(first).toContain(
      "| sc-gwd-000000000000 | 测试诗 0 | 作者 0 | poem-active-00 |",
    );
    expect(first).not.toMatch(/generated|timestamp|2026/i);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("escapes Markdown control characters in every duplicate table field", () => {
    const entries = finalizedEntries();
    entries[0]!.id = "candidate|\\\r\nid";
    entries[0]!.title = "title|\\\rtitle";
    entries[0]!.author = "author|\\\nauthor";
    entries[0]!.duplicateOf = "active|\\\r\ntarget";

    const summary = serializePoemReviewSummary(
      entries,
      "a".repeat(64),
      "b".repeat(64),
    );
    const tableLines = summary
      .split("\n")
      .filter((line) => line.startsWith("| "));

    expect(summary).toContain(
      "| candidate\\|\\\\<br>id | title\\|\\\\<br>title | author\\|\\\\<br>author | active\\|\\\\<br>target |",
    );
    expect(summary).not.toContain("\r");
    expect(tableLines).toHaveLength(12);
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
