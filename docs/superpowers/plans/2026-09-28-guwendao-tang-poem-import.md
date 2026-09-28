# Guwendao Tang Poem Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 320 Guwendao Tang poem records into audited Chinese-garden content candidates and persist them as `POEM / DRAFT` rows in the existing MySQL backend.

**Architecture:** Add a pure TypeScript converter to `@cc/content-cli`, expose it through a small atomic-output CLI command, and feed the generated NDJSON through the existing raw-content import API. Preserve provenance in candidate audit columns and poem payload metadata, while retaining the current `content_item` and `content_revision` schema.

**Tech Stack:** TypeScript 5.5, Vitest 2, Node.js 20+, Java 21, Spring Boot, JdbcTemplate, Flyway, MySQL 8, Docker.

## Global Constraints

- Import exactly 320 source records from `/Users/bytedance/workspace/individual/overseas/ChinesePoem/content-source/guwendao/tangshi.json`.
- Store every imported item as `type=POEM`, `status=DRAFT`, `level=5`, `difficulty=5`, and `promotionRequired=true`.
- Use stable IDs in the form `sc-gwd-<12-character sourceId>`.
- Do not modify `frontend/content/corpus/poem-bank.json` or the existing 23 formal poem records.
- Preserve source identity, URL, dynasty, category, and deterministic SHA-256 provenance.
- Repeating the import must not create duplicate content items.
- Do not activate or publish imported poems.
- Do not modify unrelated dirty worktree files.

---

### Task 1: Pure Guwendao Candidate Converter

**Files:**
- Create: `frontend/packages/content-cli/src/guwendao-poem-candidates.ts`
- Create: `frontend/packages/content-cli/test/guwendao-poem-candidates.test.ts`

**Interfaces:**
- Consumes: parsed JSON from `tangshi.json` as `unknown`.
- Produces: `buildGuwendaoPoemCandidates(input: unknown): GuwendaoPoemCandidate[]`.
- Produces: `serializeGuwendaoPoemCandidates(candidates: readonly GuwendaoPoemCandidate[]): string`.

- [ ] **Step 1: Write failing conversion tests**

Create tests that build a 320-record fixture and assert:

```ts
const candidates = buildGuwendaoPoemCandidates(sourceDocument());

expect(candidates).toHaveLength(320);
expect(candidates[0]).toEqual({
  importKey: "GUWENDAO_TANG:000000000000",
  source: "GUWENDAO_TANG",
  sourceRef: "https://www.guwendao.net/shiwenv_000000000000.aspx",
  sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  ruleVersion: "guwendao-tang-poem-v1",
  id: "sc-gwd-000000000000",
  type: "POEM",
  suggestedLevel: 5,
  suggestedDifficulty: 5,
  promotionRequired: true,
  tags: ["唐诗", "古文岛", "五言绝句"],
  payload: {
    title: "测试诗 0",
    author: "测试作者",
    lines: ["第一句。", "第二句。"],
    charRefs: [],
    source: {
      sourceId: "000000000000",
      dynasty: "唐代",
      category: "五言绝句",
      sourceUrl: "https://www.guwendao.net/shiwenv_000000000000.aspx",
    },
  },
  score: 100,
});
expect(new Set(candidates.map(({ id }) => id))).toHaveSize(320);
```

Add table-driven failure cases for:

```ts
[
  ["recordCount", 319],
  ["errors", ["fetch failed"]],
  ["duplicate sourceId", "000000000000"],
  ["invalid source URL", "https://example.com/shiwenv_000000000000.aspx"],
  ["empty lines", []],
  ["text mismatch", "不同文本"],
]
```

Assert stable serialization and hashing by running the converter twice and
comparing the complete NDJSON output.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/guwendao-poem-candidates.test.ts
```

Expected: FAIL because `../src/guwendao-poem-candidates` does not exist.

- [ ] **Step 3: Implement strict source parsing and deterministic mapping**

Create the converter with these public shapes:

```ts
export interface GuwendaoPoemCandidate {
  importKey: string;
  source: "GUWENDAO_TANG";
  sourceRef: string;
  sourceHash: string;
  ruleVersion: "guwendao-tang-poem-v1";
  id: string;
  type: "POEM";
  suggestedLevel: 5;
  suggestedDifficulty: 5;
  promotionRequired: true;
  tags: [string, string, string];
  payload: {
    title: string;
    author: string;
    lines: string[];
    charRefs: [];
    source: {
      sourceId: string;
      dynasty: string;
      category: string;
      sourceUrl: string;
    };
  };
  score: 100;
}

export function buildGuwendaoPoemCandidates(
  input: unknown,
): GuwendaoPoemCandidate[];

export function serializeGuwendaoPoemCandidates(
  candidates: readonly GuwendaoPoemCandidate[],
): string;
```

Validate the exact top-level count and error invariants. Normalize textual
fields with `normalize("NFC").trim()`, require unique source IDs matching
`/^[0-9a-f]{12}$/`, and require:

```ts
sourceUrl === `https://www.guwendao.net/shiwenv_${sourceId}.aspx`
text === lines.join("\n")
```

Build each source hash from a fixed-key canonical object:

```ts
const canonical = JSON.stringify({
  sourceId,
  category,
  indexTitle,
  title,
  author,
  dynasty,
  text,
  lines,
  sourceUrl,
});
const sourceHash = createHash("sha256")
  .update(canonical, "utf8")
  .digest("hex");
```

Serialize one compact JSON object per line with one trailing newline.

- [ ] **Step 4: Run focused tests and type checking**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/guwendao-poem-candidates.test.ts
pnpm --filter @cc/content-cli typecheck
```

Expected: all converter tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the converter**

```bash
git add frontend/packages/content-cli/src/guwendao-poem-candidates.ts frontend/packages/content-cli/test/guwendao-poem-candidates.test.ts
git commit -m "feat(content): convert Guwendao poem candidates"
```

---

### Task 2: Atomic Candidate Generation Command

**Files:**
- Modify: `frontend/packages/content-cli/src/bin.ts`
- Modify: `frontend/packages/content-cli/test/bin.test.ts`

**Interfaces:**
- Consumes: `buildGuwendaoPoemCandidates` and `serializeGuwendaoPoemCandidates` from Task 1.
- Produces: CLI command `cc-content guwendao-poem-candidates --source <json> --out <ndjson>`.

- [ ] **Step 1: Write failing CLI tests**

Add tests that invoke:

```ts
const code = await run(
  [
    "guwendao-poem-candidates",
    "--source",
    fixture.sourcePath,
    "--out",
    fixture.outputPath,
  ],
  {},
  output,
);
```

Assert:

```ts
expect(code).toBe(0);
expect(await readFile(fixture.outputPath, "utf8"))
  .toBe(serializeGuwendaoPoemCandidates(expectedCandidates));
expect(output.log).toHaveBeenCalledWith(
  expect.stringContaining("guwendao-poem-candidates: count=320"),
);
```

Add failure tests proving an invalid source leaves an existing output
unchanged and an existing `<out>.lock` makes the command return `1`.

- [ ] **Step 2: Run CLI tests and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts -t "guwendao-poem-candidates"
```

Expected: FAIL with usage or unknown-command output.

- [ ] **Step 3: Implement command parsing and atomic output**

Add:

```ts
const guwendaoPoemCandidatesUsage =
  "usage: cc-content guwendao-poem-candidates --source <tangshi.json> --out <candidates.ndjson>";
```

Implement `runGuwendaoPoemCandidates(args, output)` with exactly `--source`
and `--out`. Resolve both paths from the current working directory, parse the
source JSON, build all candidates before touching the destination, then:

1. create the destination directory;
2. acquire `<out>.lock` with `open(lockPath, "wx")`;
3. write to a temporary sibling file;
4. rename the temporary file over the destination;
5. close and remove the lock in `finally`;
6. remove the temporary file on every failure.

Register the command before the generic publish usage branch:

```ts
if (args[0] === "guwendao-poem-candidates") {
  return await runGuwendaoPoemCandidates(args, output);
}
```

- [ ] **Step 4: Run CLI tests and content-cli type checking**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts -t "guwendao-poem-candidates"
pnpm --filter @cc/content-cli typecheck
```

Expected: focused tests and type checking pass.

- [ ] **Step 5: Commit the CLI adapter**

```bash
git add frontend/packages/content-cli/src/bin.ts frontend/packages/content-cli/test/bin.test.ts
git commit -m "feat(content): generate Guwendao import snapshot"
```

---

### Task 3: Preserve Import Metadata End To End

**Files:**
- Modify: `backend/modules/operations/src/main/java/com/childedu/chinese/operations/application/RawContentImportService.java`
- Modify: `backend/modules/operations/src/test/java/com/childedu/chinese/operations/application/RawContentImportServiceTest.java`
- Modify: `frontend/packages/content-cli/src/bin.ts`
- Modify: `frontend/packages/content-cli/test/bin.test.ts`

**Interfaces:**
- Consumes: candidate `tags` and `ruleVersion`.
- Produces: persisted `content_revision.tags_json` and accurate import-batch request metadata.

- [ ] **Step 1: Write failing backend tag-preservation test**

Make the test candidate contain:

```java
List.of("唐诗", "古文岛", "五言绝句")
```

After `appendCandidates`, assert:

```java
String tags = jdbc.queryForObject(
    "SELECT tags_json FROM content_revision WHERE item_id = ? AND revision = 1",
    String.class,
    "sc-gwd-45c396367f59");
assertThat(objectMapper.readTree(tags))
    .isEqualTo(objectMapper.readTree("[\"唐诗\",\"古文岛\",\"五言绝句\"]"));
```

- [ ] **Step 2: Run the backend test and verify RED**

Run:

```bash
cd backend
mvn -pl modules/operations -am \
  -Dtest=RawContentImportServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL because the persisted tag list is currently empty.

- [ ] **Step 3: Persist candidate tags**

Change the draft construction from `List.of()` to:

```java
ContentDraft draft =
    new ContentDraft(
        candidate.id(),
        type,
        level,
        difficulty,
        candidate.promotionRequired(),
        candidate.tags(),
        payload);
```

Rely on `ContentDraft` to reject null or blank tags and let the existing
candidate-level catch record invalid candidates as `REJECTED`.

- [ ] **Step 4: Make the ingestion CLI report the candidate rule version**

Extend the existing ingest CLI test server assertion so the create-batch body
must equal:

```ts
{
  ruleVersion: "guwendao-tang-poem-v1",
  candidateCount: 320,
}
```

Update `runIngestCandidates` to reject an empty file or mixed rule versions,
derive the unique rule version from the parsed candidates, and send
`candidateCount` instead of the hard-coded `characters` field.

- [ ] **Step 5: Run focused backend and frontend tests**

Run:

```bash
cd backend
mvn -pl modules/operations -am \
  -Dtest=RawContentImportServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test

cd ../frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts -t "ingest-candidates"
pnpm --filter @cc/content-cli typecheck
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit import metadata fixes**

```bash
git add backend/modules/operations/src/main/java/com/childedu/chinese/operations/application/RawContentImportService.java backend/modules/operations/src/test/java/com/childedu/chinese/operations/application/RawContentImportServiceTest.java frontend/packages/content-cli/src/bin.ts frontend/packages/content-cli/test/bin.test.ts
git commit -m "fix(content): preserve candidate import metadata"
```

---

### Task 4: Generate And Guard The 320-Poem Snapshot

**Files:**
- Create: `frontend/content/candidates/poems-guwendao-tang-320.ndjson`
- Create: `frontend/content/test/guwendao-poem-candidates.test.ts`

**Interfaces:**
- Consumes: Task 2's CLI and the external `tangshi.json`.
- Produces: the reviewed NDJSON artifact consumed by Task 5.

- [ ] **Step 1: Generate the candidate artifact**

Run:

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  guwendao-poem-candidates \
  --source /Users/bytedance/workspace/individual/overseas/ChinesePoem/content-source/guwendao/tangshi.json \
  --out content/candidates/poems-guwendao-tang-320.ndjson
```

Expected:

```text
guwendao-poem-candidates: count=320
```

- [ ] **Step 2: Write the snapshot guard test**

Read the committed NDJSON and assert:

```ts
expect(candidates).toHaveLength(320);
expect(new Set(candidates.map(({ id }) => id))).toHaveSize(320);
expect(new Set(candidates.map(({ importKey }) => importKey))).toHaveSize(320);
expect(candidates.every(({ type }) => type === "POEM")).toBe(true);
expect(candidates.every(({ suggestedLevel }) => suggestedLevel === 5))
  .toBe(true);
expect(candidates.every(({ promotionRequired }) => promotionRequired))
  .toBe(true);
expect(candidates.every(({ sourceHash }) =>
  /^[0-9a-f]{64}$/.test(sourceHash),
)).toBe(true);
```

Also assert the first and last stable IDs:

```ts
expect(candidates[0].id).toBe("sc-gwd-45c396367f59");
expect(candidates[319].id).toBe("sc-gwd-cdc327abcbc1");
```

- [ ] **Step 3: Run the guard and full content-cli suite**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/guwendao-poem-candidates.test.ts
pnpm --filter @cc/content-cli test
pnpm typecheck
```

Expected: all tests and TypeScript checks pass.

- [ ] **Step 4: Verify file counts and hashes**

Run:

```bash
wc -l content/candidates/poems-guwendao-tang-320.ndjson
shasum -a 256 content/candidates/poems-guwendao-tang-320.ndjson
```

Expected: exactly `320` lines and one stable SHA-256 value recorded in the
final report.

- [ ] **Step 5: Commit the generated snapshot and guard**

```bash
git add frontend/content/candidates/poems-guwendao-tang-320.ndjson frontend/content/test/guwendao-poem-candidates.test.ts
git commit -m "data(content): add Guwendao Tang poem candidates"
```

---

### Task 5: Import Into MySQL And Verify Persistence

**Files:**
- No source files modified.

**Interfaces:**
- Consumes: `frontend/content/candidates/poems-guwendao-tang-320.ndjson`.
- Produces: 320 draft rows in the existing Chinese-garden MySQL database and one completed audited import batch.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
cd backend
mvn test

cd ../frontend
pnpm test
pnpm typecheck
```

Expected: backend, frontend, and type-check suites pass without changing
unrelated files.

- [ ] **Step 2: Confirm the existing local services and pre-import count**

Run:

```bash
docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' chinese-garden-backend
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "SELECT COUNT(*) FROM content_item WHERE type='\''POEM'\'' AND id LIKE '\''sc-gwd-%'\'';"'
```

Expected: backend is `running healthy`; pre-import count is `0`. If the count
is non-zero, continue and verify idempotent skips rather than deleting data.

- [ ] **Step 3: Build and start an updated temporary backend**

Build:

```bash
docker build \
  -t chinese-garden-backend:poem-import \
  /Users/bytedance/workspace/individual/child_edu/chinese-garden/backend
```

Start the updated app against the existing database on an unused host port.
Read credentials from the existing containers directly into the new
container's environment without printing them:

```bash
docker run --rm -d \
  --name chinese-garden-poem-import-backend \
  --network chinese-garden \
  -p 127.0.0.1:8082:8080 \
  -e 'DB_URL=jdbc:mysql://chinese-garden-mysql:3306/childedu?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC' \
  -e DB_USER=childedu \
  -e DB_PASSWORD="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-mysql | sed -n 's/^MYSQL_PASSWORD=//p')" \
  -e ADMIN_TOKEN="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')" \
  -e JWT_SECRET_BASE64="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^JWT_SECRET_BASE64=//p')" \
  -e 'ADMIN_ALLOWED_IPS=127.0.0.1,172.16.0.0/12,192.168.0.0/16' \
  -v '/Users/bytedance/workspace/individual/child_edu/chinese-garden/frontend/content:/app/content:ro' \
  chinese-garden-backend:poem-import
```

Poll until healthy, then make one final failing health request:

```bash
for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8082/actuator/health >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent http://127.0.0.1:8082/actuator/health
```

Expected: JSON containing `"status":"UP"`.

- [ ] **Step 4: Import all 320 candidates through the audited API**

Run:

```bash
cd /Users/bytedance/workspace/individual/child_edu/chinese-garden/frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  ingest-candidates \
  --in content/candidates/poems-guwendao-tang-320.ndjson \
  --admin-url http://127.0.0.1:8082 \
  --admin-token "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
```

Expected:

```text
chunk 1/1: 320 candidates -> imported=320 skipped=0 rejected=0
```

If the pre-import count was already 320, expect `imported=0 skipped=320
rejected=0`.

- [ ] **Step 5: Verify database state and provenance**

Run one grouped verification query:

```bash
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "
    SELECT COUNT(*), SUM(status='\''DRAFT'\'')
    FROM content_item
    WHERE type='\''POEM'\'' AND id LIKE '\''sc-gwd-%'\'';
    SELECT COUNT(*)
    FROM content_revision
    WHERE item_id LIKE '\''sc-gwd-%'\'' AND revision=1;
    SELECT COUNT(*)
    FROM content_import_candidate
    WHERE content_type='\''POEM'\''
      AND source_name='\''GUWENDAO_TANG'\''
      AND decision='\''REJECTED'\'';
    SELECT tags_json,
           JSON_UNQUOTE(JSON_EXTRACT(payload_json, '\''$.source.sourceUrl'\''))
    FROM content_revision
    WHERE item_id='\''sc-gwd-45c396367f59'\'' AND revision=1;
  "'
```

Expected:

- first row: `320  320`;
- second row: `320`;
- third row: `0`;
- sample tags contain `唐诗`, `古文岛`, and `五言绝句`;
- sample source URL is
  `https://www.guwendao.net/shiwenv_45c396367f59.aspx`.

- [ ] **Step 6: Verify idempotency**

Run the same `ingest-candidates` command again.

Expected:

```text
chunk 1/1: 320 candidates -> imported=0 skipped=320 rejected=0
```

Re-run the content-item count query and confirm it remains exactly `320`.

- [ ] **Step 7: Stop the temporary backend and report**

Run:

```bash
docker stop chinese-garden-poem-import-backend
```

Report:

- candidate artifact SHA-256;
- first successful import batch ID;
- imported/skipped/rejected counts;
- final MySQL item and revision counts;
- focused and full test results.
