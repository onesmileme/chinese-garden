# Idiom Candidate Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and commit exactly 1,000 auditable THUOCL idiom candidates without changing the formal corpus or backend database.

**Architecture:** Add a pure candidate generator in `@cc/content-cli`, then expose it through a narrow `idiom-candidates` CLI adapter. The generator owns parsing, filtering, deterministic ranking, candidate serialization, and manifest construction; the CLI owns file reads, `pinyin-pro`, atomic writes, and user-facing errors. A tracked content test protects the resulting snapshot from overlap or accidental promotion.

**Tech Stack:** TypeScript 5.5, Node.js 20, pnpm, Vitest 2, `pinyin-pro` 3.29.4, THUOCL commit `a30ce79d895d01ab5132a5c74c29703ff7efb4cc`

## Global Constraints

- Generate exactly 1,000 candidates.
- Source words and DF values only from THUOCL `data/THUOCL_chengyu.txt` at commit `a30ce79d895d01ab5132a5c74c29703ff7efb4cc`.
- Keep only four basic CJK characters, normalize with NFC, deduplicate by text, and exclude every word in `frontend/content/corpus/idiom-bank.json`.
- Sort by DF descending and Unicode text ascending.
- Generate tone-marked pinyin with exactly `pinyin-pro` 3.29.4 and mark every pronunciation unverified.
- Leave Chinese meaning absent and mark every candidate `NEEDS_MEANING`.
- Do not modify the formal idiom bank, import candidates into the backend, or include candidates in published content packages.
- Preserve the repository's 100% coverage threshold.

---

## File Structure

- Create `frontend/packages/content-cli/src/idiom-candidates.ts`: pure THUOCL parser, filter/ranker, serializers, hashes, and manifest builder.
- Create `frontend/packages/content-cli/test/idiom-candidates.test.ts`: complete branch and behavior coverage for the pure module.
- Modify `frontend/packages/content-cli/src/bin.ts`: parse `idiom-candidates` arguments, call the pure module, generate pinyin, and atomically write outputs.
- Modify `frontend/packages/content-cli/test/bin.test.ts`: CLI integration and failure-path tests.
- Modify `frontend/packages/content-cli/package.json`: add pinned `pinyin-pro` dependency.
- Modify `frontend/pnpm-lock.yaml`: lock the dependency graph.
- Create `frontend/content/candidates/idioms-thuocl-top1000.ndjson`: reviewed candidate snapshot.
- Create `frontend/content/candidates/idioms-thuocl-top1000.manifest.json`: provenance, hashes, versions, and filter counts.
- Create `frontend/content/test/idiom-candidates.test.ts`: repository guard for count, uniqueness, overlap, shape, status, flags, and output hash.

### Task 1: Pure THUOCL Candidate Generator

**Files:**
- Create: `frontend/packages/content-cli/src/idiom-candidates.ts`
- Create: `frontend/packages/content-cli/test/idiom-candidates.test.ts`

**Interfaces:**
- Consumes: raw THUOCL text, existing idiom texts, requested count, and `(text: string) => string[]`.
- Produces: `buildIdiomCandidates`, `serializeIdiomCandidates`, `buildIdiomCandidateManifest`, `sha256Text`, and their exported data types.

- [ ] **Step 1: Write failing parser, ranking, validation, serialization, and manifest tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildIdiomCandidateManifest,
  buildIdiomCandidates,
  serializeIdiomCandidates,
  sha256Text,
} from "../src/idiom-candidates";

const pinyinFor = (text: string): string[] =>
  Array.from(text).map((character) => `py-${character}`);

describe("buildIdiomCandidates", () => {
  it("normalizes, filters, deduplicates, excludes existing words, and ranks deterministically", () => {
    const result = buildIdiomCandidates({
      sourceText: [
        "春夏秋冬\t20",
        "山高水长\t30",
        "山高水长\t40",
        "一心一意\t100",
        "三字词\t90",
        "A山高水\t80",
        "",
      ].join("\n"),
      existingTexts: new Set(["一心一意"]),
      count: 2,
      pinyinFor,
    });

    expect(result.candidates).toEqual([
      {
        id: "idiom-candidate-0001",
        text: "山高水长",
        pinyin: ["py-山", "py-高", "py-水", "py-长"],
        head: "山",
        tail: "长",
        frequency: 40,
        sourceRank: 1,
        status: "NEEDS_MEANING",
        reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
      },
      {
        id: "idiom-candidate-0002",
        text: "春夏秋冬",
        pinyin: ["py-春", "py-夏", "py-秋", "py-冬"],
        head: "春",
        tail: "冬",
        frequency: 20,
        sourceRank: 2,
        status: "NEEDS_MEANING",
        reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
      },
    ]);
    expect(result.stats).toEqual({
      sourceRecords: 6,
      fourCharacterRecords: 4,
      uniqueRecords: 3,
      excludedExisting: 1,
      available: 2,
      output: 2,
    });
  });

  it("uses Unicode text order to break equal-frequency ties", () => {
    const result = buildIdiomCandidates({
      sourceText: "春夏秋冬\t10\n山高水长\t10\n",
      existingTexts: new Set(),
      count: 2,
      pinyinFor,
    });
    expect(result.candidates.map(({ text }) => text)).toEqual([
      "山高水长",
      "春夏秋冬",
    ]);
  });

  it.each(["坏行", "春夏秋冬\tnan", "春夏秋冬\t0", "春夏秋冬\t-1"])(
    "rejects malformed source line %s",
    (line) => {
      expect(() =>
        buildIdiomCandidates({
          sourceText: line,
          existingTexts: new Set(),
          count: 1,
          pinyinFor,
        }),
      ).toThrow(/THUOCL line 1/);
    },
  );

  it("rejects non-positive target counts and insufficient candidates", () => {
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 0,
        pinyinFor,
      }),
    ).toThrow("count must be a positive integer");
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 2,
        pinyinFor,
      }),
    ).toThrow("requested 2 candidates, only 1 available");
  });

  it("rejects generated pinyin that does not contain four syllables", () => {
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 1,
        pinyinFor: () => ["chūn"],
      }),
    ).toThrow("春夏秋冬: expected 4 pinyin syllables");
  });
});

describe("idiom candidate output", () => {
  const generated = buildIdiomCandidates({
    sourceText: "春夏秋冬\t1\n",
    existingTexts: new Set(),
    count: 1,
    pinyinFor,
  });

  it("serializes stable newline-delimited JSON", () => {
    const output = serializeIdiomCandidates(generated.candidates);
    expect(output.endsWith("\n")).toBe(true);
    expect(output.trim().split("\n")).toHaveLength(1);
    expect(serializeIdiomCandidates([])).toBe("");
  });

  it("builds complete provenance and hashes", () => {
    const ndjson = serializeIdiomCandidates(generated.candidates);
    const manifest = buildIdiomCandidateManifest({
      sourceCommit: "a".repeat(40),
      sourceSha256: sha256Text("source"),
      bankSha256: sha256Text("bank"),
      outputSha256: sha256Text(ndjson),
      fetchedAt: "2026-09-26T00:00:00.000Z",
      pinyinProVersion: "3.29.4",
      count: 1,
      stats: generated.stats,
    });
    expect(manifest.schemaVersion).toBe("idiom-candidates-v1");
    expect(manifest.source.commit).toBe("a".repeat(40));
    expect(manifest.output.count).toBe(1);
  });

  it.each([
    ["sourceCommit", "main"],
    ["sourceSha256", ""],
    ["bankSha256", "bad-hash"],
    ["outputSha256", "bad-hash"],
    ["fetchedAt", "invalid"],
    ["pinyinProVersion", ""],
    ["count", 2],
  ] as const)("rejects malformed manifest field %s", (field, value) => {
    const valid = {
      sourceCommit: "a".repeat(40),
      sourceSha256: "a".repeat(64),
      bankSha256: "b".repeat(64),
      outputSha256: "c".repeat(64),
      fetchedAt: "2026-09-26T00:00:00.000Z",
      pinyinProVersion: "3.29.4",
      count: 1,
      stats: generated.stats,
    };
    expect(() =>
      buildIdiomCandidateManifest({ ...valid, [field]: value }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/idiom-candidates.test.ts
```

Expected: FAIL because `../src/idiom-candidates` does not exist.

- [ ] **Step 3: Implement the pure candidate module**

Create `frontend/packages/content-cli/src/idiom-candidates.ts` with these exact public contracts:

```ts
import { createHash } from "node:crypto";

export interface IdiomCandidate {
  id: string;
  text: string;
  pinyin: string[];
  head: string;
  tail: string;
  frequency: number;
  sourceRank: number;
  status: "NEEDS_MEANING";
  reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"];
}

export interface IdiomCandidateStats {
  sourceRecords: number;
  fourCharacterRecords: number;
  uniqueRecords: number;
  excludedExisting: number;
  available: number;
  output: number;
}

export interface IdiomCandidateManifest {
  schemaVersion: "idiom-candidates-v1";
  source: {
    name: "THUOCL";
    url: string;
    license: "MIT";
    licenseUrl: string;
    commit: string;
    sha256: string;
    fetchedAt: string;
  };
  generator: {
    command: string;
    pinyinProVersion: string;
    ranking: "frequency-desc-text-unicode-asc";
  };
  inputs: { idiomBankSha256: string };
  stats: IdiomCandidateStats;
  output: { file: string; count: number; sha256: string };
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
```

Implement `buildIdiomCandidates` so it:

1. splits non-empty lines;
2. validates exactly two tab-separated fields and a positive integer DF;
3. NFC-normalizes text;
4. filters with `/^[\u4E00-\u9FFF]{4}$/u`;
5. keeps the maximum DF per word;
6. counts and excludes existing words;
7. sorts with `right.frequency - left.frequency || compareCodePoints(left.text, right.text)`;
8. fails before mapping when fewer than `count` remain;
9. validates four trimmed pinyin syllables;
10. emits fixed IDs and flags.

Use a code-point comparator rather than locale-dependent `localeCompare`:

```ts
function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index]! - rightPoints[index]!;
    }
  }
  return leftPoints.length - rightPoints.length;
}
```

Implement stable serialization:

```ts
export function serializeIdiomCandidates(
  candidates: readonly IdiomCandidate[],
): string {
  return candidates.length === 0
    ? ""
    : `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`;
}
```

Implement `buildIdiomCandidateManifest` with fixed THUOCL URLs, strict 40-character lowercase hex commit validation, strict 64-character lowercase hex hash validation, valid ISO timestamp validation, non-empty `pinyinProVersion`, and `count === stats.output`.

- [ ] **Step 4: Run focused tests and coverage**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/idiom-candidates.test.ts --coverage
```

Expected: PASS and 100% lines, branches, functions, and statements for `idiom-candidates.ts`.

- [ ] **Step 5: Commit the pure generator**

```bash
git add frontend/packages/content-cli/src/idiom-candidates.ts \
  frontend/packages/content-cli/test/idiom-candidates.test.ts
git commit -m "feat: add THUOCL idiom candidate generator"
```

### Task 2: CLI Adapter and Atomic Output

**Files:**
- Modify: `frontend/packages/content-cli/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/packages/content-cli/src/bin.ts`
- Modify: `frontend/packages/content-cli/test/bin.test.ts`

**Interfaces:**
- Consumes: Task 1's `buildIdiomCandidates`, `serializeIdiomCandidates`, `buildIdiomCandidateManifest`, and `sha256Text`.
- Produces: `cc-content idiom-candidates --source ... --bank ... --out ... --count ... --source-commit ... --fetched-at ...`.

- [ ] **Step 1: Add pinned pinyin dependency**

Run:

```bash
cd frontend
pnpm --filter @cc/content-cli add pinyin-pro@3.29.4 --save-exact
```

Expected: `package.json` contains `"pinyin-pro": "3.29.4"` and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write failing CLI integration tests**

Append a `cc-content idiom-candidates command` describe block to `frontend/packages/content-cli/test/bin.test.ts`. The success fixture must create a temporary THUOCL file with at least three four-character words, a bank containing one of them, invoke:

```ts
const code = await run(
  [
    "idiom-candidates",
    "--source", sourcePath,
    "--bank", bankPath,
    "--out", outputDirectory,
    "--count", "2",
    "--source-commit", "a".repeat(40),
    "--fetched-at", "2026-09-26T00:00:00.000Z",
  ],
  {},
  output,
);
```

Assert:

```ts
expect(code).toBe(0);
expect(output.error).not.toHaveBeenCalled();
expect(output.log).toHaveBeenCalledWith(
  expect.stringContaining("idiom-candidates: count=2"),
);
const first = await readFile(
  join(outputDirectory, "idioms-thuocl-top1000.ndjson"),
  "utf8",
);
const secondCode = await run(/* same arguments */, {}, output);
const second = await readFile(
  join(outputDirectory, "idioms-thuocl-top1000.ndjson"),
  "utf8",
);
expect(secondCode).toBe(0);
expect(second).toBe(first);
```

Also test unknown options, missing required options, invalid `--count`, malformed source content, and a missing bank. Each must return exit code 2 for usage errors or 1 for input/data errors and must not leave either final output file.

- [ ] **Step 3: Run the CLI tests and verify red**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts
```

Expected: FAIL because `idiom-candidates` routes to generic usage.

- [ ] **Step 4: Implement the CLI adapter**

In `frontend/packages/content-cli/src/bin.ts`:

- import `rename` and `rm` from `node:fs/promises`;
- import `pinyin` from `pinyin-pro`;
- import Task 1's four functions;
- add this usage string:

```ts
const idiomCandidatesUsage =
  "usage: cc-content idiom-candidates --source <THUOCL_chengyu.txt> --bank <idiom-bank.json> --out <directory> --count <n> --source-commit <sha> --fetched-at <ISO-8601>";
```

- add `runIdiomCandidates`;
- route `args[0] === "idiom-candidates"` before `publish`.

The adapter must parse every option exactly once, resolve paths from the current working directory, parse `bank.idioms[].text`, and call:

```ts
const generated = buildIdiomCandidates({
  sourceText,
  existingTexts: new Set(bank.idioms.map(({ text }) => text)),
  count,
  pinyinFor(text) {
    return pinyin(text, { type: "array", toneType: "symbol" });
  },
});
```

Serialize the NDJSON, build the manifest with `pinyinProVersion: "3.29.4"`, and write formatted JSON ending in `\n`.

Write each output to a sibling `.<name>.<pid>.tmp` file first. After both temporary writes succeed, rename NDJSON and then manifest to their final names. In `finally`, remove temporary files with `{ force: true }`. Never create or modify the formal bank.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/idiom-candidates.test.ts \
  packages/content-cli/test/bin.test.ts
pnpm --filter @cc/content-cli typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the CLI**

```bash
git add frontend/packages/content-cli/package.json frontend/pnpm-lock.yaml \
  frontend/packages/content-cli/src/bin.ts \
  frontend/packages/content-cli/test/bin.test.ts
git commit -m "feat: generate auditable idiom candidate snapshots"
```

### Task 3: Fetch, Generate, and Guard the 1,000-Item Snapshot

**Files:**
- Create locally, ignored: `frontend/content/raw/thuocl/THUOCL_chengyu.txt`
- Create: `frontend/content/candidates/idioms-thuocl-top1000.ndjson`
- Create: `frontend/content/candidates/idioms-thuocl-top1000.manifest.json`
- Create: `frontend/content/test/idiom-candidates.test.ts`

**Interfaces:**
- Consumes: Task 2's CLI and the formal `idiom-bank.json`.
- Produces: the committed 1,000-item candidate snapshot and a test that protects its invariants.

- [ ] **Step 1: Download the pinned official source and verify it**

Run:

```bash
mkdir -p frontend/content/raw/thuocl
curl -fL \
  https://raw.githubusercontent.com/thunlp/THUOCL/a30ce79d895d01ab5132a5c74c29703ff7efb4cc/data/THUOCL_chengyu.txt \
  -o frontend/content/raw/thuocl/THUOCL_chengyu.txt
shasum -a 256 frontend/content/raw/thuocl/THUOCL_chengyu.txt
wc -l frontend/content/raw/thuocl/THUOCL_chengyu.txt
```

Expected SHA-256: `c339d5d6e37d4f8ecdcb82f2a02b7fdfc66796f0a5215155f2aff8a77e89a7eb`.

Expected records: 8,519.

- [ ] **Step 2: Generate the snapshot**

Run:

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts idiom-candidates \
  --source content/raw/thuocl/THUOCL_chengyu.txt \
  --bank content/corpus/idiom-bank.json \
  --out content/candidates \
  --count 1000 \
  --source-commit a30ce79d895d01ab5132a5c74c29703ff7efb4cc \
  --fetched-at 2026-09-26T00:00:00.000Z
```

Expected: `idiom-candidates: count=1000` and two output files under `frontend/content/candidates/`.

- [ ] **Step 3: Write the failing repository guard**

Create `frontend/content/test/idiom-candidates.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candidatePath = new URL(
  "../candidates/idioms-thuocl-top1000.ndjson",
  import.meta.url,
);
const manifestPath = new URL(
  "../candidates/idioms-thuocl-top1000.manifest.json",
  import.meta.url,
);
const bankPath = new URL("../corpus/idiom-bank.json", import.meta.url);

describe("THUOCL idiom candidate snapshot", () => {
  it("contains 1,000 isolated review-only candidates with a matching hash", () => {
    const raw = readFileSync(candidatePath, "utf8");
    const candidates = raw.trim().split("\n").map((line) => JSON.parse(line));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const bank = JSON.parse(readFileSync(bankPath, "utf8"));
    const formalTexts = new Set(bank.idioms.map(({ text }: { text: string }) => text));

    expect(candidates).toHaveLength(1000);
    expect(new Set(candidates.map(({ id }: { id: string }) => id)).size).toBe(1000);
    expect(new Set(candidates.map(({ text }: { text: string }) => text)).size).toBe(1000);

    for (const candidate of candidates) {
      expect(candidate.text).toMatch(/^[\u4E00-\u9FFF]{4}$/u);
      expect(candidate.pinyin).toHaveLength(4);
      expect(candidate.head).toBe(Array.from(candidate.text)[0]);
      expect(candidate.tail).toBe(Array.from(candidate.text)[3]);
      expect(candidate.status).toBe("NEEDS_MEANING");
      expect(candidate.reviewFlags).toEqual([
        "PINYIN_UNVERIFIED",
        "MEANING_MISSING",
      ]);
      expect(formalTexts.has(candidate.text)).toBe(false);
      expect(candidate.meaning).toBeUndefined();
    }

    expect(manifest.output.count).toBe(1000);
    expect(manifest.source.commit).toBe(
      "a30ce79d895d01ab5132a5c74c29703ff7efb4cc",
    );
    expect(manifest.generator.pinyinProVersion).toBe("3.29.4");
    expect(manifest.output.sha256).toBe(
      createHash("sha256").update(raw, "utf8").digest("hex"),
    );
  });
});
```

- [ ] **Step 4: Run the content guard and verify green**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/idiom-candidates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify the formal bank and backend remain unchanged**

Run:

```bash
cd frontend
jq '.idioms | length' content/corpus/idiom-bank.json
git diff --exit-code -- content/corpus/idiom-bank.json
```

Expected: `47` and no diff.

- [ ] **Step 6: Run the complete frontend verification**

Run:

```bash
cd frontend
pnpm typecheck
pnpm test
pnpm test:cov
```

Expected: all commands exit 0; coverage remains 100% for lines, branches, functions, and statements.

- [ ] **Step 7: Inspect candidate statistics**

Run:

```bash
jq '.' frontend/content/candidates/idioms-thuocl-top1000.manifest.json
wc -l frontend/content/candidates/idioms-thuocl-top1000.ndjson
```

Expected: manifest output count and `wc -l` both equal 1,000; source SHA, bank SHA, output SHA, commit, license, and filter counts are present.

- [ ] **Step 8: Commit the candidate assets**

```bash
git add frontend/content/candidates/idioms-thuocl-top1000.ndjson \
  frontend/content/candidates/idioms-thuocl-top1000.manifest.json \
  frontend/content/test/idiom-candidates.test.ts
git commit -m "data: add 1000 THUOCL idiom candidates"
```
