# Formal And Candidate Content Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the existing formal poem and idiom catalog, convert all 1,000 THUOCL idiom candidates into audited backend candidates, and import them as reviewable drafts.

**Architecture:** Add a pure converter beside the existing idiom candidate generator, then expose it through one narrow CLI command that validates both the candidate snapshot and its manifest before atomically writing backend-compatible NDJSON. Reuse the existing `ingest-candidates` command and `RawContentImportService`; no database schema or backend behavior changes are required.

**Tech Stack:** TypeScript 5.5, Node.js 20+, Vitest 2, `pinyin-pro` 3.29.4, Spring Boot 3.3.4, Java 21, MySQL 8, Docker.

## Global Constraints

- Keep the existing 47 formal idioms and 23 formal poems `ACTIVE`.
- Keep the existing 320 Guwendao poem candidates `DRAFT`.
- Import exactly 1,000 THUOCL idiom candidates as `IDIOM / DRAFT`.
- Never activate candidates with missing meanings or unreviewed pinyin.
- Preserve source URL, source commit, source rank, frequency, review flags, and deterministic SHA-256 provenance.
- Use stable `cy-thuocl-<12 lowercase hex>` content IDs derived from normalized idiom text.
- Import through `/v1/admin/content-imports`; do not insert content rows directly with SQL.
- Repeated conversion must be byte-identical and repeated import must create no duplicate content.
- Preserve unrelated dirty worktree files.
- Maintain the frontend's 100% coverage threshold.

---

## File Structure

- Create `frontend/packages/content-cli/src/idiom-review-candidates.ts`: validate the tracked candidate snapshot and manifest, map candidates to the backend import contract, and serialize deterministic NDJSON.
- Create `frontend/packages/content-cli/test/idiom-review-candidates.test.ts`: public converter behavior, malformed input, provenance, collision, and deterministic serialization tests.
- Modify `frontend/packages/content-cli/src/bin.ts`: add `idiom-review-candidates --in --manifest --out` and atomic output handling.
- Modify `frontend/packages/content-cli/test/bin.test.ts`: command success, usage, invalid input, source/output alias, lock, and atomicity tests.
- Create `frontend/content/candidates/idioms-thuocl-top1000-import.ndjson`: tracked, backend-compatible review import artifact.
- Create `frontend/content/test/idiom-review-candidates.test.ts`: repository-level count, identity, state, provenance, and source-snapshot consistency guard.

### Task 1: Pure Idiom Review Candidate Converter

**Files:**
- Create: `frontend/packages/content-cli/src/idiom-review-candidates.ts`
- Create: `frontend/packages/content-cli/test/idiom-review-candidates.test.ts`

**Interfaces:**
- Consumes:

```ts
export interface BuildIdiomReviewCandidatesOptions {
  candidateText: string;
  manifest: unknown;
  toneFreePinyinFor(text: string): string[];
}
```

- Produces:

```ts
export interface IdiomReviewCandidate {
  importKey: string;
  source: "THUOCL_IDIOM";
  sourceRef: string;
  sourceHash: string;
  ruleVersion: "thuocl-idiom-review-v1";
  id: string;
  type: "IDIOM";
  suggestedLevel: 5;
  suggestedDifficulty: 5;
  promotionRequired: true;
  tags: ["成语", "THUOCL", "待补释义", "拼音待复核"];
  payload: {
    text: string;
    meaning: "";
    headPinyin: string;
    tailPinyin: string;
    pinyin: string[];
    source: {
      candidateId: string;
      sourceCommit: string;
      sourceRank: number;
      frequency: number;
      reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"];
    };
  };
  score: number;
}

export function buildIdiomReviewCandidates(
  options: BuildIdiomReviewCandidatesOptions,
): IdiomReviewCandidate[];

export function serializeIdiomReviewCandidates(
  candidates: readonly IdiomReviewCandidate[],
): string;
```

- [ ] **Step 1: Write the first failing mapping test**

Create a two-record fixture whose manifest contains the fixture byte count and
SHA-256. Assert the first mapped item exactly:

```ts
const candidates = buildIdiomReviewCandidates({
  candidateText: sourceText,
  manifest,
  toneFreePinyinFor: (text) =>
    text === "坚定不移"
      ? ["jian", "ding", "bu", "yi"]
      : ["feng", "fu", "duo", "cai"],
});

expect(candidates[0]).toEqual({
  importKey: "THUOCL_IDIOM:idiom-candidate-0001",
  source: "THUOCL_IDIOM",
  sourceRef: manifest.source.url,
  sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  ruleVersion: "thuocl-idiom-review-v1",
  id: `cy-thuocl-${sha256Text("坚定不移").slice(0, 12)}`,
  type: "IDIOM",
  suggestedLevel: 5,
  suggestedDifficulty: 5,
  promotionRequired: true,
  tags: ["成语", "THUOCL", "待补释义", "拼音待复核"],
  payload: {
    text: "坚定不移",
    meaning: "",
    headPinyin: "jian",
    tailPinyin: "yi",
    pinyin: ["jiān", "dìng", "bù", "yí"],
    source: {
      candidateId: "idiom-candidate-0001",
      sourceCommit: "a".repeat(40),
      sourceRank: 1,
      frequency: 54113,
      reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
    },
  },
  score: 54113,
});
expect(candidates).toHaveLength(2);
expect(new Set(candidates.map(({ id }) => id)).size).toBe(2);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/idiom-review-candidates.test.ts
```

Expected: FAIL because `../src/idiom-review-candidates` does not exist.

- [ ] **Step 3: Implement strict parsing and mapping**

Implement the module with these rules:

```ts
const EXPECTED_COUNT = 1000;
const SOURCE = "THUOCL_IDIOM";
const RULE_VERSION = "thuocl-idiom-review-v1";
const FOUR_BASIC_CJK = /^[\u4E00-\u9FFF]{4}$/u;
const TONE_FREE_PINYIN = /^[a-z]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
```

Parse non-empty NDJSON lines as unknown values. For each candidate require:

```ts
{
  id: `idiom-candidate-${String(index + 1).padStart(4, "0")}`,
  text: four basic CJK characters,
  pinyin: exactly four non-empty strings,
  head: first text character,
  tail: fourth text character,
  frequency: positive safe integer,
  sourceRank: index + 1,
  status: "NEEDS_MEANING",
  reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
}
```

Require the manifest to have:

```ts
{
  schemaVersion: "idiom-candidates-v1",
  source: {
    name: "THUOCL",
    url: nonEmptyHttpsUrl,
    commit: fortyCharacterLowercaseHex,
  },
  output: {
    count: 1000,
    sha256: sha256(candidateText),
  },
}
```

Call `toneFreePinyinFor(candidate.text)` and require exactly four lowercase
ASCII syllables. Use the first and fourth values for `headPinyin` and
`tailPinyin`.

Build the source hash from this fixed-key object:

```ts
const canonical = JSON.stringify({
  id,
  text,
  pinyin,
  head,
  tail,
  frequency,
  sourceRank,
  status,
  reviewFlags,
});
const sourceHash = sha256Text(canonical);
```

Reject duplicate source IDs, duplicate normalized text, duplicate output IDs,
malformed lines, count mismatches, source hash mismatches, and invalid
tone-free pinyin.

- [ ] **Step 4: Add failure and deterministic serialization tests**

Add table-driven tests for:

```ts
[
  "malformed JSON line",
  "wrong candidate count",
  "manifest output count mismatch",
  "manifest SHA-256 mismatch",
  "duplicate candidate id",
  "duplicate candidate text",
  "candidate id does not match rank",
  "non-four-character text",
  "pinyin length is not four",
  "head or tail mismatch",
  "review flags differ",
  "tone-free pinyin is not four lowercase ASCII syllables",
]
```

Assert:

```ts
const first = serializeIdiomReviewCandidates(candidates);
const second = serializeIdiomReviewCandidates(
  buildIdiomReviewCandidates(options),
);
expect(first).toBe(second);
expect(first.endsWith("\n")).toBe(true);
expect(serializeIdiomReviewCandidates([])).toBe("");
```

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/idiom-review-candidates.test.ts
pnpm --filter @cc/content-cli typecheck
```

Expected: all converter tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the converter**

```bash
git add \
  frontend/packages/content-cli/src/idiom-review-candidates.ts \
  frontend/packages/content-cli/test/idiom-review-candidates.test.ts
git commit -m "feat(content): convert idioms for review import"
```

### Task 2: Atomic Review Artifact Command

**Files:**
- Modify: `frontend/packages/content-cli/src/bin.ts`
- Modify: `frontend/packages/content-cli/test/bin.test.ts`

**Interfaces:**
- Consumes:

```ts
buildIdiomReviewCandidates({
  candidateText,
  manifest,
  toneFreePinyinFor,
});
serializeIdiomReviewCandidates(candidates);
```

- Produces:

```text
cc-content idiom-review-candidates \
  --in <idioms-thuocl-top1000.ndjson> \
  --manifest <idioms-thuocl-top1000.manifest.json> \
  --out <idioms-thuocl-top1000-import.ndjson>
```

- [ ] **Step 1: Write the failing CLI success test**

Add a fixture with 1,000 valid candidate lines and a matching manifest. Invoke:

```ts
const code = await run(
  [
    "idiom-review-candidates",
    "--in",
    fixture.candidatePath,
    "--manifest",
    fixture.manifestPath,
    "--out",
    fixture.outputPath,
  ],
  {},
  output,
);
```

Assert exit code `0`, exactly 1,000 output lines, expected first candidate,
and:

```ts
expect(output.log).toHaveBeenCalledWith(
  expect.stringContaining("idiom-review-candidates: count=1000"),
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts \
  -t "idiom-review-candidates"
```

Expected: FAIL with command usage because the command is not registered.

- [ ] **Step 3: Implement argument parsing and atomic output**

Import the converter and add:

```ts
const idiomReviewCandidatesUsage =
  "usage: cc-content idiom-review-candidates --in <candidate.ndjson> --manifest <manifest.json> --out <raw.ndjson>";
```

Implement `runIdiomReviewCandidates(args, output)` to:

1. accept each required option exactly once;
2. resolve paths from the current working directory;
3. reject source, manifest, and output aliases using `realpath` where available;
4. read and validate both inputs before touching the output;
5. obtain tone-free pinyin with:

```ts
pinyin(text, { type: "array", toneType: "none", v: true })
```

6. acquire `<out>.lock` with `open(lockPath, "wx")`;
7. write a unique temporary sibling with `flag: "wx"`;
8. rename the temporary file over the destination;
9. remove only the temporary file and owned lock in `finally`;
10. log the count and absolute output path.

Register the command before the generic publish branch:

```ts
if (args[0] === "idiom-review-candidates") {
  return await runIdiomReviewCandidates(args, output);
}
```

- [ ] **Step 4: Add CLI failure-path tests**

Cover:

```ts
[
  "unknown option",
  "duplicate option",
  "missing option value",
  "missing required option",
  "invalid candidate file",
  "invalid manifest",
  "source path equals output path",
  "manifest path equals output path",
  "source or output symlink aliases",
  "existing output lock",
]
```

For every validation or lock failure, assert the existing output is unchanged
and no temporary file remains.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts \
  -t "idiom-review-candidates"
pnpm --filter @cc/content-cli typecheck
```

Expected: focused tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the CLI command**

```bash
git add \
  frontend/packages/content-cli/src/bin.ts \
  frontend/packages/content-cli/test/bin.test.ts
git commit -m "feat(content): generate idiom review import"
```

### Task 3: Generate And Guard The Review Import Artifact

**Files:**
- Create: `frontend/content/candidates/idioms-thuocl-top1000-import.ndjson`
- Create: `frontend/content/test/idiom-review-candidates.test.ts`

**Interfaces:**
- Consumes:
  - `frontend/content/candidates/idioms-thuocl-top1000.ndjson`
  - `frontend/content/candidates/idioms-thuocl-top1000.manifest.json`
- Produces: 1,000 backend-compatible `RawCandidate` records.

- [ ] **Step 1: Write the repository guard**

Create a content test that reads the source snapshot, manifest, and generated
artifact. Assert:

```ts
expect(importCandidates).toHaveLength(1000);
expect(new Set(importCandidates.map(({ id }) => id)).size).toBe(1000);
expect(new Set(importCandidates.map(({ importKey }) => importKey)).size)
  .toBe(1000);
expect(importCandidates.every(({ type }) => type === "IDIOM")).toBe(true);
expect(importCandidates.every(({ suggestedLevel }) => suggestedLevel === 5))
  .toBe(true);
expect(importCandidates.every(({ promotionRequired }) => promotionRequired))
  .toBe(true);
expect(importCandidates.every(({ payload }) => payload.meaning === ""))
  .toBe(true);
expect(importCandidates.every(({ sourceHash }) =>
  /^[0-9a-f]{64}$/.test(sourceHash),
)).toBe(true);
```

For every index, verify source-to-output identity, text, pinyin, frequency,
rank, flags, source URL, source commit, and stable text-derived ID. Record the
complete artifact SHA-256 as a literal expected value.

- [ ] **Step 2: Run the guard and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/idiom-review-candidates.test.ts
```

Expected: FAIL because
`content/candidates/idioms-thuocl-top1000-import.ndjson` does not exist.

- [ ] **Step 3: Generate the deterministic artifact**

Run:

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  idiom-review-candidates \
  --in content/candidates/idioms-thuocl-top1000.ndjson \
  --manifest content/candidates/idioms-thuocl-top1000.manifest.json \
  --out content/candidates/idioms-thuocl-top1000-import.ndjson
```

Expected:

```text
idiom-review-candidates: count=1000
```

- [ ] **Step 4: Run the guard and verify GREEN**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/idiom-review-candidates.test.ts
wc -l content/candidates/idioms-thuocl-top1000-import.ndjson
shasum -a 256 content/candidates/idioms-thuocl-top1000-import.ndjson
```

Expected: test passes, line count is exactly `1000`, and the SHA-256 equals the
literal asserted by the guard.

- [ ] **Step 5: Run full frontend verification**

Run:

```bash
cd frontend
pnpm test
pnpm typecheck
pnpm test:cov
```

Expected: all tests and type checks pass, with 100% lines, branches, functions,
and statements for included files.

- [ ] **Step 6: Commit the generated artifact and guard**

```bash
git add \
  frontend/content/candidates/idioms-thuocl-top1000-import.ndjson \
  frontend/content/test/idiom-review-candidates.test.ts
git commit -m "data(content): add idiom review import snapshot"
```

### Task 4: Import And Verify The Local Database

**Files:**
- No source files modified.

**Interfaces:**
- Consumes: `frontend/content/candidates/idioms-thuocl-top1000-import.ndjson`.
- Produces: one completed audited import batch and 1,000 `IDIOM / DRAFT`
  records in the current `chinese-garden-mysql` database.

- [ ] **Step 1: Verify service health and pre-import invariants**

Run:

```bash
docker inspect --format \
  '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \
  chinese-garden-backend
curl --fail --silent http://127.0.0.1:8081/actuator/health
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "
    SELECT type, status, COUNT(*)
    FROM content_item
    GROUP BY type, status
    ORDER BY type, status;
    SELECT COUNT(*)
    FROM content_item
    WHERE id LIKE '\''cy-thuocl-%'\'';
  "'
```

Expected: backend is `running healthy`; formal counts are `IDIOM ACTIVE 47`
and `POEM ACTIVE 23`; poem drafts are `320`; THUOCL draft count is `0`.
If THUOCL rows already exist, continue with idempotency verification and do
not delete them.

- [ ] **Step 2: Import all 1,000 candidates through the audited API**

Run without printing the admin token:

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  ingest-candidates \
  --in content/candidates/idioms-thuocl-top1000-import.ndjson \
  --admin-url http://127.0.0.1:8081 \
  --admin-token "$(docker inspect --format \
    '{{range .Config.Env}}{{println .}}{{end}}' \
    chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
```

Expected for a clean import:

```text
chunk 1/1: 1000 candidates -> imported=1000 skipped=0 rejected=0
```

- [ ] **Step 3: Verify persistence, status, and provenance**

Run:

```bash
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "
    SELECT type, status, COUNT(*)
    FROM content_item
    GROUP BY type, status
    ORDER BY type, status;
    SELECT COUNT(*)
    FROM content_revision
    WHERE item_id LIKE '\''cy-thuocl-%'\'' AND revision = 1;
    SELECT status, result_json
    FROM content_import_batch
    WHERE rule_version = '\''thuocl-idiom-review-v1'\''
    ORDER BY started_at DESC
    LIMIT 1;
    SELECT tags_json,
           JSON_UNQUOTE(JSON_EXTRACT(payload_json, '\''$.text'\'')),
           JSON_UNQUOTE(JSON_EXTRACT(payload_json, '\''$.source.sourceCommit'\''))
    FROM content_revision
    WHERE item_id LIKE '\''cy-thuocl-%'\''
    ORDER BY item_id
    LIMIT 1;
  "'
```

Expected:

- `IDIOM ACTIVE 47`;
- `IDIOM DRAFT 1000`;
- `POEM ACTIVE 23`;
- `POEM DRAFT 320`;
- exactly 1,000 matching revision rows;
- latest batch is `COMPLETED` with `imported=1000`, `rejected=0`;
- representative tags, text, and source commit are present.

- [ ] **Step 4: Verify review availability through the admin API**

Read the token into a shell variable without echoing it, then run:

```bash
ADMIN_TOKEN="$(docker inspect --format \
  '{{range .Config.Env}}{{println .}}{{end}}' \
  chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
curl --fail --silent \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  'http://127.0.0.1:8081/v1/admin/content/items?type=IDIOM&status=DRAFT&limit=1'
unset ADMIN_TOKEN
```

Expected: a page containing one `cy-thuocl-*` item with status `DRAFT`.

- [ ] **Step 5: Verify idempotency**

Run the same `ingest-candidates` command again.

Expected:

```text
chunk 1/1: 1000 candidates -> imported=0 skipped=1000 rejected=0
```

Re-run the aggregate query and confirm `IDIOM / DRAFT` remains exactly 1,000.

- [ ] **Step 6: Run final repository and database checks**

Run:

```bash
cd backend
mvn test

cd ../frontend
pnpm test
pnpm typecheck
pnpm test:cov

/opt/homebrew/bin/git diff --check
/opt/homebrew/bin/git status --short
```

Expected: all tests pass, coverage gates pass, no whitespace errors exist,
and only pre-existing unrelated worktree files remain uncommitted.

- [ ] **Step 7: Report the result**

Report:

- three implementation commit IDs;
- generated artifact SHA-256;
- first import batch ID and imported/skipped/rejected counts;
- idempotency batch result;
- final database counts by type and status;
- representative admin API result;
- frontend and backend test results;
- the existing unrelated dirty files left untouched.
