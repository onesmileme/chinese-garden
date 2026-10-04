# Guwendao Poem Title Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep all 320 Guwendao Tang poems while making every candidate's author and displayed title pair unique.

**Architecture:** Extend the pure Guwendao converter with deterministic collision grouping and first-clause title suffixes, then regenerate the tracked NDJSON artifact under rule version `guwendao-tang-poem-v2`. Preserve stable IDs, import keys, and source hashes. Repair the four existing database rows through the authenticated content-authoring API so normal revision and audit semantics remain intact.

**Tech Stack:** TypeScript, Node.js 20, Vitest 2, pnpm 6 workspace, Spring Boot admin API, MySQL 8, Docker

## Global Constraints

- Keep exactly 320 Guwendao poem candidates and 23 formal active poems.
- Preserve every candidate's `id`, `importKey`, `sourceRef`, source ID, source URL, and `sourceHash`.
- Change `payload.title` only for the four approved conflicting records.
- Use `guwendao-tang-poem-v2` for every regenerated candidate.
- Do not delete, merge, activate, or publish any poem.
- Do not update content tables directly with SQL.
- Use TDD and complete specification and code-quality review after each implementation task.
- Preserve unrelated worktree changes in `frontend/apps/miniapp/package.json`, `frontend/pnpm-lock.yaml`, and untracked local tooling directories.
- Use `/opt/homebrew/bin/git`; the system Git executable is unavailable.

## File Map

- Modify `frontend/packages/content-cli/src/guwendao-poem-candidates.ts`: derive unique display titles and emit rule version v2.
- Modify `frontend/packages/content-cli/test/guwendao-poem-candidates.test.ts`: lock collision handling, failure behavior, stable identity, and source hashes.
- Modify `frontend/content/candidates/poems-guwendao-tang-320.ndjson`: regenerated v2 import artifact.
- Modify `frontend/content/test/guwendao-poem-candidates.test.ts`: lock v2 artifact hash, title uniqueness, and the four expected titles.
- Runtime only: update four existing MySQL-backed content items through `/v1/admin/content/items/{id}`.

---

### Task 1: Add Deterministic Title Disambiguation

**Files:**
- Modify: `frontend/packages/content-cli/src/guwendao-poem-candidates.ts:3-217`
- Modify: `frontend/packages/content-cli/test/guwendao-poem-candidates.test.ts:44-249`

**Interfaces:**
- Consumes: `buildGuwendaoPoemCandidates(input: unknown)`.
- Produces: the existing `GuwendaoPoemCandidate[]` contract with `ruleVersion: "guwendao-tang-poem-v2"` and collision-only display-title suffixes.

- [ ] **Step 1: Write failing public-boundary tests**

Add tests that create collisions inside `sourceDocument()` without bypassing source validation:

```ts
it("disambiguates same-author same-title poems with the first clause", () => {
  const document = sourceDocument();
  Object.assign(document.poems[0]!, {
    title: "同题",
    author: "同一作者",
    lines: ["甲句，甲句后半。", "甲末句。"],
    text: "甲句，甲句后半。\n甲末句。",
  });
  Object.assign(document.poems[1]!, {
    title: "同题",
    author: "同一作者",
    lines: ["乙句；乙句后半。", "乙末句。"],
    text: "乙句；乙句后半。\n乙末句。",
  });

  const candidates = buildGuwendaoPoemCandidates(document);

  expect(candidates[0]!.payload.title).toBe("同题（甲句）");
  expect(candidates[1]!.payload.title).toBe("同题（乙句）");
  expect(candidates[0]!.id).toBe("sc-gwd-000000000000");
  expect(candidates[1]!.id).toBe("sc-gwd-000000000001");
});

it("does not disambiguate equal titles from different authors", () => {
  const document = sourceDocument();
  document.poems[0]!.title = "同题";
  document.poems[0]!.author = "作者甲";
  document.poems[1]!.title = "同题";
  document.poems[1]!.author = "作者乙";

  const candidates = buildGuwendaoPoemCandidates(document);

  expect(candidates[0]!.payload.title).toBe("同题");
  expect(candidates[1]!.payload.title).toBe("同题");
});

it("rejects collisions that the first clause cannot disambiguate", () => {
  const document = sourceDocument();
  Object.assign(document.poems[0]!, {
    title: "同题",
    author: "同一作者",
    lines: ["相同首句，甲。", "甲末句。"],
    text: "相同首句，甲。\n甲末句。",
  });
  Object.assign(document.poems[1]!, {
    title: "同题",
    author: "同一作者",
    lines: ["相同首句，乙。", "乙末句。"],
    text: "相同首句，乙。\n乙末句。",
  });

  expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
    "display title must be unique for author",
  );
});

it("rejects an empty first clause for a conflicting title", () => {
  const document = sourceDocument();
  for (const index of [0, 1]) {
    Object.assign(document.poems[index]!, {
      title: "同题",
      author: "同一作者",
      lines: ["，后半句。", "末句。"],
      text: "，后半句。\n末句。",
    });
  }

  expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
    "must have a non-empty first clause",
  );
});
```

Update the expected rule version in the baseline conversion assertion:

```ts
ruleVersion: "guwendao-tang-poem-v2",
```

Add a source-hash stability assertion around a collision:

```ts
const baseline = buildGuwendaoPoemCandidates(sourceDocument());
const colliding = sourceDocument();
colliding.poems[0]!.title = colliding.poems[1]!.title;
colliding.poems[0]!.author = colliding.poems[1]!.author;
const converted = buildGuwendaoPoemCandidates(colliding);
expect(converted[0]!.sourceHash).not.toBe(baseline[0]!.sourceHash);
expect(converted[1]!.sourceHash).toBe(baseline[1]!.sourceHash);
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```bash
cd frontend
./node_modules/.bin/vitest run \
  packages/content-cli/test/guwendao-poem-candidates.test.ts
```

Expected: failure because titles remain ambiguous and the converter still emits `guwendao-tang-poem-v1`.

- [ ] **Step 3: Implement grouping, suffix extraction, and uniqueness validation**

Change the public literal type:

```ts
ruleVersion: "guwendao-tang-poem-v2";
```

Add focused private helpers:

```ts
const CLAUSE_END_PATTERN = /[，。！？；：]/u;

function titleKey(author: string, title: string): string {
  return JSON.stringify([author, title]);
}

function firstClause(poem: GuwendaoSourcePoem, index: number): string {
  const clause = poem.lines[0]!.split(CLAUSE_END_PATTERN, 1)[0]!.trim();
  if (clause.length === 0) {
    throw new Error(
      `poems[${index}].lines[0] must have a non-empty first clause`,
    );
  }
  return clause;
}
```

After parsing, validate source IDs before deriving titles, then count normalized source title keys:

```ts
const sourceIds = new Set<string>();
poems.forEach((poem, index) => {
  if (sourceIds.has(poem.sourceId)) {
    throw new Error(`poems[${index}].sourceId must be unique`);
  }
  sourceIds.add(poem.sourceId);
});

const titleCounts = new Map<string, number>();
for (const poem of poems) {
  const key = titleKey(poem.author, poem.title);
  titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
}

const displayTitles = poems.map((poem, index) => {
  const key = titleKey(poem.author, poem.title);
  return titleCounts.get(key) === 1
    ? poem.title
    : `${poem.title}（${firstClause(poem, index)}）`;
});

const displayKeys = new Set<string>();
displayTitles.forEach((title, index) => {
  const key = titleKey(poems[index]!.author, title);
  if (displayKeys.has(key)) {
    throw new Error(
      `poems[${index}].display title must be unique for author`,
    );
  }
  displayKeys.add(key);
});
```

Map `displayTitles[index]` to `payload.title` and emit:

```ts
ruleVersion: "guwendao-tang-poem-v2",
```

Do not alter `sourceHash(poem)`.

- [ ] **Step 4: Run focused tests, coverage, and typecheck**

Run:

```bash
cd frontend
./node_modules/.bin/vitest run \
  packages/content-cli/test/guwendao-poem-candidates.test.ts \
  --coverage
./node_modules/.bin/tsc -b --pretty
```

Expected: focused tests pass, the converter has 100% statements, branches, functions, and lines, and TypeScript exits 0.

- [ ] **Step 5: Review and commit Task 1**

Review the implementation against the design, then review code quality and test coverage. Fix findings before committing.

```bash
/opt/homebrew/bin/git add \
  frontend/packages/content-cli/src/guwendao-poem-candidates.ts \
  frontend/packages/content-cli/test/guwendao-poem-candidates.test.ts
/opt/homebrew/bin/git commit -m \
  "fix(content): disambiguate Guwendao poem titles"
```

---

### Task 2: Regenerate and Guard the V2 Artifact

**Files:**
- Modify: `frontend/content/candidates/poems-guwendao-tang-320.ndjson`
- Modify: `frontend/content/test/guwendao-poem-candidates.test.ts:41-130`

**Interfaces:**
- Consumes: `cc-content guwendao-poem-candidates --source <json> --out <ndjson>`.
- Produces: a deterministic 320-line v2 artifact with SHA-256 `b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def`.

- [ ] **Step 1: Strengthen the repository guard before regeneration**

Update the rule-version assertion:

```ts
expect(
  candidates.every(
    ({ ruleVersion }) => ruleVersion === "guwendao-tang-poem-v2",
  ),
).toBe(true);
```

Add display-identity and exact-title assertions:

```ts
const displayKeys = candidates.map(
  ({ payload }) => `${payload.author}\u0000${payload.title}`,
);
expect(new Set(displayKeys).size).toBe(320);

const titlesById = Object.fromEntries(
  candidates.map(({ id, payload }) => [id, payload.title]),
);
expect(titlesById).toMatchObject({
  "sc-gwd-2d27cb0ecae4": "无题二首·其一（凤尾香罗薄几重）",
  "sc-gwd-05c6c4ccf634": "无题二首·其一（昨夜星辰昨夜风）",
  "sc-gwd-0c472e85a3ad": "隋宫（乘兴南游不戒严）",
  "sc-gwd-09fd71c77ec7": "隋宫（紫泉宫殿锁烟霞）",
});
```

Do not update the old artifact hash yet.

- [ ] **Step 2: Run the repository guard and observe RED**

Run:

```bash
cd frontend
./node_modules/.bin/vitest run \
  content/test/guwendao-poem-candidates.test.ts
```

Expected: failure because the tracked artifact is still v1 and has two duplicate author/title groups.

- [ ] **Step 3: Regenerate the artifact atomically**

Run:

```bash
cd frontend
packages/content-cli/node_modules/.bin/tsx \
  packages/content-cli/src/bin.ts \
  guwendao-poem-candidates \
  --source /Users/bytedance/workspace/individual/overseas/ChinesePoem/content-source/guwendao/tangshi.json \
  --out content/candidates/poems-guwendao-tang-320.ndjson
```

Expected:

```text
guwendao-poem-candidates: count=320
```

- [ ] **Step 4: Verify the artifact diff and update the exact hash**

Run:

```bash
cd frontend
wc -l content/candidates/poems-guwendao-tang-320.ndjson
shasum -a 256 content/candidates/poems-guwendao-tang-320.ndjson
/opt/homebrew/bin/git diff --numstat -- \
  content/candidates/poems-guwendao-tang-320.ndjson
```

Expected:

```text
320 content/candidates/poems-guwendao-tang-320.ndjson
b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def
320 320 content/candidates/poems-guwendao-tang-320.ndjson
```

The line-wise diff changes all 320 `ruleVersion` fields and only the four approved `payload.title` values. Update the test literal to:

```ts
expect(sha256(raw)).toBe(
  "b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def",
);
```

- [ ] **Step 5: Run artifact, CLI, full frontend, and type checks**

Run:

```bash
cd frontend
./node_modules/.bin/vitest run \
  content/test/guwendao-poem-candidates.test.ts \
  packages/content-cli/test/guwendao-poem-candidates.test.ts \
  packages/content-cli/test/bin.test.ts
./node_modules/.bin/vitest run
./node_modules/.bin/vitest run --coverage
./node_modules/.bin/tsc -b --pretty
```

Expected: all tests pass, all four coverage dimensions remain 100%, and TypeScript exits 0.

- [ ] **Step 6: Review and commit Task 2**

Perform specification and code-quality review. Confirm no source IDs, import keys, source references, or source hashes changed.

```bash
/opt/homebrew/bin/git add \
  frontend/content/candidates/poems-guwendao-tang-320.ndjson \
  frontend/content/test/guwendao-poem-candidates.test.ts
/opt/homebrew/bin/git commit -m \
  "data(content): disambiguate Guwendao poem titles"
```

---

### Task 3: Repair Existing Drafts Through the Admin API

**Files:**
- No source files modified.
- Runtime state: four `content_item` rows and four new `content_revision` rows.

**Interfaces:**
- Consumes: healthy backend at `http://127.0.0.1:8081` and `ADMIN_TOKEN` from `chinese-garden-backend`.
- Produces: four `POEM / DRAFT` items at revision 2 with unique author/title pairs and four successful `UPDATE` audit rows.

- [ ] **Step 1: Assert runtime preconditions**

Run:

```bash
curl -fsS http://127.0.0.1:8081/actuator/health

/usr/local/bin/docker exec chinese-garden-mysql sh -lc '
mysql --default-character-set=utf8mb4 \
  -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -e "
SELECT id, status, current_revision,
       JSON_UNQUOTE(JSON_EXTRACT(payload_json, '\''$.title'\''))
FROM content_item
JOIN content_revision
  ON item_id = id AND revision = current_revision
WHERE id IN (
  '\''sc-gwd-2d27cb0ecae4'\'',
  '\''sc-gwd-05c6c4ccf634'\'',
  '\''sc-gwd-0c472e85a3ad'\'',
  '\''sc-gwd-09fd71c77ec7'\''
)
ORDER BY id;"
'
```

Expected: backend is `UP`; all four items are `DRAFT`, at revision 1, with the two ambiguous source titles.

- [ ] **Step 2: Patch the four items with optimistic locking**

Run this idempotent Node 20 script. It reads each current item before writing and refuses unexpected state:

```bash
ADMIN_TOKEN="$(
  /usr/local/bin/docker exec chinese-garden-backend printenv ADMIN_TOKEN
)" /Users/bytedance/.nvm/versions/node/v20.19.5/bin/node <<'NODE'
const baseUrl = "http://127.0.0.1:8081";
const token = process.env.ADMIN_TOKEN;
const targets = {
  "sc-gwd-2d27cb0ecae4": {
    from: "无题二首·其一",
    to: "无题二首·其一（凤尾香罗薄几重）",
  },
  "sc-gwd-05c6c4ccf634": {
    from: "无题二首·其一",
    to: "无题二首·其一（昨夜星辰昨夜风）",
  },
  "sc-gwd-0c472e85a3ad": {
    from: "隋宫",
    to: "隋宫（乘兴南游不戒严）",
  },
  "sc-gwd-09fd71c77ec7": {
    from: "隋宫",
    to: "隋宫（紫泉宫殿锁烟霞）",
  },
};

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": token,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

for (const [id, expected] of Object.entries(targets)) {
  const item = await request(`/v1/admin/content/items/${encodeURIComponent(id)}`);
  if (
    item.payload.title === expected.to &&
    item.revision === 2 &&
    item.status === "DRAFT"
  ) {
    console.log(`skip ${id}: already repaired`);
    continue;
  }
  if (
    item.payload.title !== expected.from ||
    item.revision !== 1 ||
    item.status !== "DRAFT"
  ) {
    throw new Error(
      `${id}: unexpected state title=${item.payload.title} revision=${item.revision} status=${item.status}`,
    );
  }
  const draft = {
    id: item.id,
    type: item.type,
    level: item.level,
    difficulty: item.difficulty,
    promotionRequired: item.promotionRequired,
    tags: item.tags,
    payload: { ...item.payload, title: expected.to },
  };
  const updated = await request(
    `/v1/admin/content/items/${encodeURIComponent(id)}?expectedRevision=1`,
    { method: "PATCH", body: JSON.stringify(draft) },
  );
  console.log(`updated ${id}: revision=${updated.revision} title=${updated.payload.title}`);
}
NODE
```

Expected: four `updated` lines on the first run, or four `skip` lines when safely repeated.

- [ ] **Step 3: Verify counts, uniqueness, revisions, and audit rows**

Run:

```bash
/usr/local/bin/docker exec chinese-garden-mysql sh -lc '
mysql --default-character-set=utf8mb4 \
  -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -e "
SELECT type, status, COUNT(*)
FROM content_item
WHERE type = '\''POEM'\''
GROUP BY type, status
ORDER BY status;

SELECT COUNT(*) duplicate_groups
FROM (
  SELECT
    JSON_UNQUOTE(JSON_EXTRACT(cr.payload_json, '\''$.author'\'')) author,
    JSON_UNQUOTE(JSON_EXTRACT(cr.payload_json, '\''$.title'\'')) title
  FROM content_item ci
  JOIN content_revision cr
    ON cr.item_id = ci.id AND cr.revision = ci.current_revision
  WHERE ci.type = '\''POEM'\''
    AND ci.status = '\''DRAFT'\''
  GROUP BY author, title
  HAVING COUNT(*) > 1
) duplicates;

SELECT ci.id, ci.status, ci.current_revision,
       JSON_UNQUOTE(JSON_EXTRACT(cr.payload_json, '\''$.title'\''))
FROM content_item ci
JOIN content_revision cr
  ON cr.item_id = ci.id AND cr.revision = ci.current_revision
WHERE ci.id IN (
  '\''sc-gwd-2d27cb0ecae4'\'',
  '\''sc-gwd-05c6c4ccf634'\'',
  '\''sc-gwd-0c472e85a3ad'\'',
  '\''sc-gwd-09fd71c77ec7'\''
)
ORDER BY ci.id;

SELECT target, action, success, COUNT(*)
FROM admin_audit_log
WHERE target IN (
  '\''sc-gwd-2d27cb0ecae4'\'',
  '\''sc-gwd-05c6c4ccf634'\'',
  '\''sc-gwd-0c472e85a3ad'\'',
  '\''sc-gwd-09fd71c77ec7'\''
)
  AND action = '\''UPDATE'\''
GROUP BY target, action, success
ORDER BY target;"
'
```

Expected:

```text
POEM ACTIVE 23
POEM DRAFT 320
duplicate_groups 0
```

Each target is `DRAFT`, revision 2, has its approved title, and has one successful `UPDATE` audit row.

- [ ] **Step 4: Verify representative admin API reads**

For each target ID, call:

```bash
TOKEN="$(
  /usr/local/bin/docker exec chinese-garden-backend printenv ADMIN_TOKEN
)"
curl -fsS \
  -H "X-Admin-Token: $TOKEN" \
  "http://127.0.0.1:8081/v1/admin/content/items/sc-gwd-09fd71c77ec7" |
  jq '{id, type, status, revision, title: .payload.title}'
```

Expected:

```json
{
  "id": "sc-gwd-09fd71c77ec7",
  "type": "POEM",
  "status": "DRAFT",
  "revision": 2,
  "title": "隋宫（紫泉宫殿锁烟霞）"
}
```

- [ ] **Step 5: Final status check**

Run:

```bash
/opt/homebrew/bin/git status --short
/opt/homebrew/bin/git log --oneline -5
```

Expected: task files are committed. Only the user's pre-existing miniapp, lockfile, browser-debug, task-store, and SWC changes remain.
