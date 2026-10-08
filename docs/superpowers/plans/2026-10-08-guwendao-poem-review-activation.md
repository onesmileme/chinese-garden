# Guwendao 唐诗审核与批量激活实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立覆盖 320 首古文岛唐诗候选的确定性审核清单，归档 10 首重复候选，并通过现有受审计管理 API 激活其余 310 首。

**Architecture:** Java 内容域新增跨入口生效的唐诗作者+正文重复保护；TypeScript CLI 使用共享黄金向量生成同构身份键。清单生成器从固定候选制品和管理 API 快照生成 `310 ACTIVATE + 10 ARCHIVE_DUPLICATE` 决策，应用器先全量预检，再顺序调用现有单条 `validate/activate/archive` API，并以数据库状态实现幂等续跑。

**Tech Stack:** Java 21、Spring Modulith 1.2.4、Jackson、JUnit 5、AssertJ、TypeScript 5.5、Node.js 20、Vitest 2、原生 Fetch API、MySQL 8、Docker/Colima。

**Design:** `docs/superpowers/specs/2026-10-05-guwendao-poem-review-activation-design.md`

## Global Constraints

- 必须复用 `/v1/admin/content/items/{id}/validate|activate|archive`，不得直接写内容表。
- 管理主体必须同时具有 `REVIEWER` 和 `EDITOR`；actor 只取后端认证结果。
- 清单精确覆盖 320 条：310 条 `ACTIVATE`，10 条 `ARCHIVE_DUPLICATE`。
- 10 条重复候选归档，不删除；23 条原正式唐诗不得修改。
- 激活和归档不得改变 revision、payload、等级、难度、标签或 `charRefs`。
- 唐诗身份固定为 NFKC 后移除 Unicode 空白及标点的作者、NUL、按顺序连接并同样规范化的正文。
- TS 与 Java 必须消费同一份 `frontend/content/test-vectors/poem-identity-v1.json` 黄金向量。
- 前端逻辑代码保持 100% Vitest lines/branches/functions/statements 覆盖率。
- 严格使用 TDD；每个任务完成后分别执行规格复核和代码质量复核，再提交。
- Git 命令必须使用 `/opt/homebrew/bin/git`。
- 只提交本计划涉及的文件，不纳入现有 `frontend/apps/miniapp/package.json`、`frontend/pnpm-lock.yaml` 和本地生成目录。

---

## File Structure

### Shared identity contract

- `frontend/content/test-vectors/poem-identity-v1.json`: TS/Java 共用的规范化黄金向量。
- `frontend/packages/content-cli/src/poem-identity.ts`: TS 规范化、身份键及规范 JSON 哈希。
- `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/PoemIdentity.java`: Java 规范化和身份键。

### Backend duplicate guard

- `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentIssueCode.java`: 新增重复问题码。
- `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentValidator.java`: 激活前检查 `ACTIVE` 唐诗重复。
- `backend/modules/content/src/test/java/com/childedu/chinese/content/PoemIdentityTest.java`: Java 黄金向量测试。
- `backend/modules/content/src/test/java/com/childedu/chinese/content/ContentValidatorTest.java`: 内容域重复规则测试。
- `backend/modules/operations/src/test/java/com/childedu/chinese/operations/ContentAuthoringServiceTest.java`: 重复阻断时状态和审计不变。

### Review checklist

- `frontend/packages/content-cli/src/poem-review.ts`: 候选解析、分类、清单校验和确定性序列化。
- `frontend/packages/content-cli/test/poem-review.test.ts`: 清单纯逻辑测试。
- `frontend/content/reviews/poems-guwendao-tang-320-review.ndjson`: 320 行机器可读审核清单。
- `frontend/content/reviews/poems-guwendao-tang-320-review-summary.md`: 输入哈希、决策统计和 10 组重复映射。
- `frontend/content/test/guwendao-poem-review.test.ts`: 仓库级制品守护。

### Review execution

- `frontend/packages/content-cli/src/poem-review-application.ts`: 全量预检、顺序迁移、幂等续跑、报告和后验验证。
- `frontend/packages/content-cli/src/poem-review-admin.ts`: 管理 API port 契约。
- `frontend/packages/content-cli/src/adapters/http-poem-review-admin.ts`: 分页查询和单条管理 HTTP 调用。
- `frontend/packages/content-cli/src/adapters/atomic-file.ts`: 原子写清单、摘要和执行报告。
- `frontend/packages/content-cli/src/bin.ts`: 两个新命令的参数解析与接线。
- `frontend/packages/content-cli/test/poem-review-application.test.ts`: 应用服务测试。
- `frontend/packages/content-cli/test/bin.test.ts`: CLI/HTTP 边界测试。
- `frontend/content/reviews/poems-guwendao-tang-320-activation-report.json`: 首次执行报告。

---

### Task 1: Shared TypeScript Poem Identity Contract

**Files:**
- Create: `frontend/content/test-vectors/poem-identity-v1.json`
- Create: `frontend/packages/content-cli/src/poem-identity.ts`
- Create: `frontend/packages/content-cli/test/poem-identity.test.ts`

**Interfaces:**
- Produces: `normalizePoemText(value: string): string`
- Produces: `poemIdentity(author: string, lines: readonly string[]): string`
- Produces: `sha256Text(value: string): string`
- Produces: `canonicalJsonSha256(value: unknown): string`
- Consumes: no application state or network.

- [ ] **Step 1: Add the shared golden vectors**

Create `frontend/content/test-vectors/poem-identity-v1.json`:

```json
{
  "ruleVersion": "poem-identity-v1",
  "vectors": [
    {
      "name": "plain",
      "author": "李白",
      "lines": ["床前明月光", "疑是地上霜"],
      "normalizedAuthor": "李白",
      "normalizedBody": "床前明月光疑是地上霜",
      "identity": "李白\u0000床前明月光疑是地上霜"
    },
    {
      "name": "whitespace-and-punctuation",
      "author": " 李 白 ",
      "lines": ["床前明月光，", "疑是地上霜。"],
      "normalizedAuthor": "李白",
      "normalizedBody": "床前明月光疑是地上霜",
      "identity": "李白\u0000床前明月光疑是地上霜"
    },
    {
      "name": "fullwidth-compatibility",
      "author": "Ｌｉ　Ｂａｉ",
      "lines": ["白日依山盡，", "黃河入海流。"],
      "normalizedAuthor": "LiBai",
      "normalizedBody": "白日依山盡黃河入海流",
      "identity": "LiBai\u0000白日依山盡黃河入海流"
    },
    {
      "name": "ascii-punctuation",
      "author": "Wang_Wei",
      "lines": ["red, bean!", "grows-in spring"],
      "normalizedAuthor": "WangWei",
      "normalizedBody": "redbeangrowsinspring",
      "identity": "WangWei\u0000redbeangrowsinspring"
    }
  ]
}
```

- [ ] **Step 2: Write failing TypeScript identity tests**

Create `frontend/packages/content-cli/test/poem-identity.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalJsonSha256,
  normalizePoemText,
  poemIdentity,
  sha256Text,
} from "../src/poem-identity";

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../content/test-vectors/poem-identity-v1.json", import.meta.url),
    "utf8",
  ),
) as {
  vectors: Array<{
    name: string;
    author: string;
    lines: string[];
    normalizedAuthor: string;
    normalizedBody: string;
    identity: string;
  }>;
};

describe("poem identity", () => {
  it.each(vectors.vectors)("matches $name", (vector) => {
    expect(normalizePoemText(vector.author)).toBe(vector.normalizedAuthor);
    expect(normalizePoemText(vector.lines.join(""))).toBe(vector.normalizedBody);
    expect(poemIdentity(vector.author, vector.lines)).toBe(vector.identity);
  });

  it("hashes canonical objects independently of key insertion order", () => {
    expect(canonicalJsonSha256({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe(
      canonicalJsonSha256({ a: [1, { c: 3, d: 4 }], b: 2 }),
    );
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the red state**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-identity.test.ts
```

Expected: FAIL because `../src/poem-identity` does not exist.

- [ ] **Step 4: Implement the minimal TS identity module**

Create `frontend/packages/content-cli/src/poem-identity.ts`:

```ts
import { createHash } from "node:crypto";

const IGNORED_POEM_CODE_POINTS = /[\p{White_Space}\p{P}]/gu;

export function normalizePoemText(value: string): string {
  return value.normalize("NFKC").replace(IGNORED_POEM_CODE_POINTS, "");
}

export function poemIdentity(
  author: string,
  lines: readonly string[],
): string {
  return `${normalizePoemText(author)}\u0000${normalizePoemText(lines.join(""))}`;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Text(JSON.stringify(canonicalize(value)));
}
```

- [ ] **Step 5: Run focused tests and coverage**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-identity.test.ts
pnpm test:cov
pnpm typecheck
```

Expected: focused tests pass; full coverage and typecheck remain green.

- [ ] **Step 6: Run specification and quality reviews**

Verify the implementation removes exactly Unicode `White_Space` and `P*` code points after NFKC, preserves line order, emits a literal NUL separator, and contains no file/network dependency. Then review branch coverage and canonical object recursion.

- [ ] **Step 7: Commit Task 1**

```bash
/opt/homebrew/bin/git add \
  frontend/content/test-vectors/poem-identity-v1.json \
  frontend/packages/content-cli/src/poem-identity.ts \
  frontend/packages/content-cli/test/poem-identity.test.ts
/opt/homebrew/bin/git commit -m "feat(content): define poem identity contract"
```

---

### Task 2: Backend Duplicate Activation Guard

**Files:**
- Create: `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/PoemIdentity.java`
- Create: `backend/modules/content/src/test/java/com/childedu/chinese/content/PoemIdentityTest.java`
- Modify: `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentIssueCode.java`
- Modify: `backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentValidator.java`
- Modify: `backend/modules/content/src/test/java/com/childedu/chinese/content/ContentValidatorTest.java`
- Modify: `backend/modules/operations/src/test/java/com/childedu/chinese/operations/ContentAuthoringServiceTest.java`

**Interfaces:**
- Consumes: `poem-identity-v1.json` created by Task 1.
- Produces: `PoemIdentity.of(String author, List<String> lines): String`
- Produces: `ContentIssueCode.POEM_BODY_DUPLICATE`
- Produces: activation failure with `/payload/lines` when an `ACTIVE` poem has the same identity.

- [ ] **Step 1: Write failing Java identity and validator tests**

Create `PoemIdentityTest.java` that walks parent directories until it finds the shared vector file:

```java
@Test
void matchesSharedTypeScriptGoldenVectors() throws Exception {
  JsonNode vectors = MAPPER.readTree(Files.readString(findVectors()));
  for (JsonNode vector : vectors.path("vectors")) {
    List<String> lines =
        MAPPER.convertValue(vector.path("lines"), new TypeReference<List<String>>() {});
    assertThat(PoemIdentity.normalize(vector.path("author").asText()))
        .isEqualTo(vector.path("normalizedAuthor").asText());
    assertThat(PoemIdentity.of(vector.path("author").asText(), lines))
        .isEqualTo(vector.path("identity").asText());
  }
}

private static Path findVectors() {
  for (Path root = Path.of("").toAbsolutePath(); root != null; root = root.getParent()) {
    Path candidate =
        root.resolve("frontend/content/test-vectors/poem-identity-v1.json");
    if (Files.isRegularFile(candidate)) return candidate;
  }
  throw new IllegalStateException("poem identity vectors not found");
}
```

Add focused cases to `ContentValidatorTest`:

```java
@Test
void rejectsPoemMatchingAnActivePoemAfterNormalization() {
  ContentItemView candidate =
      poem("sc-candidate", ContentLevel.L5, List.of(), " 李 白 ", "静夜思",
          List.of("床前明月光，", "疑是地上霜。"));
  ContentItemView active =
      poem("sc-existing", ContentLevel.L2, List.of(), "李白", "静夜思",
          List.of("床前明月光", "疑是地上霜"));

  assertThat(validator().validateItem(candidate, List.of(active)))
      .singleElement()
      .satisfies(issue -> {
        assertThat(issue.code()).isEqualTo(ContentIssueCode.POEM_BODY_DUPLICATE);
        assertThat(issue.path()).isEqualTo("/payload/lines");
        assertThat(issue.message()).contains("sc-existing");
      });
}

@Test
void ignoresDraftArchivedDifferentAuthorAndDifferentBodyPoems() {
  ContentItemView candidate =
      poem("sc-candidate", ContentLevel.L5, List.of(), "李白", "静夜思",
          List.of("床前明月光"));
  List<ContentItemView> catalog =
      List.of(
          withStatus(poem("sc-draft", ContentLevel.L5, List.of(), "李白", "静夜思",
              List.of("床前明月光")), ContentStatus.DRAFT),
          withStatus(poem("sc-archived", ContentLevel.L5, List.of(), "李白", "静夜思",
              List.of("床前明月光")), ContentStatus.ARCHIVED),
          poem("sc-author", ContentLevel.L5, List.of(), "杜甫", "静夜思",
              List.of("床前明月光")),
          poem("sc-body", ContentLevel.L5, List.of(), "李白", "静夜思",
              List.of("举头望明月")));

  assertThat(validator().validateItem(candidate, catalog)).isEmpty();
}
```

Extend the existing poem helper rather than encoding JSON separately in each
test:

```java
private static ContentItemView poem(
    String id,
    ContentLevel level,
    List<String> characterReferences,
    String author,
    String title,
    List<String> lines) {
  return item(
      id,
      ContentType.POEM,
      level,
      MAPPER.valueToTree(
          Map.of(
              "title", title,
              "author", author,
              "lines", lines,
              "charRefs", characterReferences)));
}
```

Add this service test and a `poemRequest` helper to
`ContentAuthoringServiceTest`:

```java
@Test
void reviewerCannotActivateAPoemDuplicatingActiveContent() throws Exception {
  InMemoryCatalogRepository repository = new InMemoryCatalogRepository();
  RecordingAuditLog audit = new RecordingAuditLog();
  ContentAuthoringService service = service(repository, audit);
  service.create(poemRequest("sc-existing", "李白", List.of("床前明月光")), EDITOR);
  service.activate("sc-existing", 1, REVIEWER);
  service.create(
      poemRequest("sc-candidate", " 李 白 ", List.of("床前明月光，")),
      EDITOR);
  long activationEventsBefore =
      audit.events.stream().filter(event -> event.action().equals("ACTIVATE")).count();

  assertThatThrownBy(() -> service.activate("sc-candidate", 1, REVIEWER))
      .isInstanceOfSatisfying(
          ContentValidationException.class,
          error ->
              assertThat(error.issues())
                  .extracting(ContentIssue::code)
                  .containsExactly(ContentIssueCode.POEM_BODY_DUPLICATE));
  assertThat(service.find("sc-candidate").status()).isEqualTo(ContentStatus.DRAFT);
  assertThat(
          audit.events.stream().filter(event -> event.action().equals("ACTIVATE")).count())
      .isEqualTo(activationEventsBefore);
}

private static SaveContentRequest poemRequest(
    String id, String author, List<String> lines) {
  return new SaveContentRequest(
      id,
      ContentType.POEM,
      ContentLevel.L5,
      ContentLevel.L5,
      true,
      List.of("唐诗"),
      MAPPER.valueToTree(
          Map.of(
              "title", "静夜思",
              "author", author,
              "lines", lines,
              "charRefs", List.of())));
}
```

- [ ] **Step 2: Run focused backend tests and confirm the red state**

Run:

```bash
cd backend
mvn -pl modules/content,modules/operations -am \
  -Dtest=PoemIdentityTest,ContentValidatorTest,ContentAuthoringServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL because `PoemIdentity` and `POEM_BODY_DUPLICATE` do not exist.

- [ ] **Step 3: Implement Java identity normalization**

Create `PoemIdentity.java`:

```java
package com.childedu.chinese.content.domain;

import java.text.Normalizer;
import java.util.List;
import java.util.Objects;

public final class PoemIdentity {

  private PoemIdentity() {}

  public static String of(String author, List<String> lines) {
    Objects.requireNonNull(lines, "poem lines");
    return normalize(author) + '\0' + normalize(String.join("", lines));
  }

  public static String normalize(String value) {
    String normalized =
        Normalizer.normalize(Objects.requireNonNull(value, "poem text"), Normalizer.Form.NFKC);
    StringBuilder result = new StringBuilder(normalized.length());
    normalized.codePoints().filter(codePoint -> !ignored(codePoint)).forEach(result::appendCodePoint);
    return result.toString();
  }

  private static boolean ignored(int codePoint) {
    int type = Character.getType(codePoint);
    return Character.isWhitespace(codePoint)
        || Character.isSpaceChar(codePoint)
        || type == Character.CONNECTOR_PUNCTUATION
        || type == Character.DASH_PUNCTUATION
        || type == Character.START_PUNCTUATION
        || type == Character.END_PUNCTUATION
        || type == Character.INITIAL_QUOTE_PUNCTUATION
        || type == Character.FINAL_QUOTE_PUNCTUATION
        || type == Character.OTHER_PUNCTUATION;
  }
}
```

- [ ] **Step 4: Add duplicate validation**

Add `POEM_BODY_DUPLICATE` to `ContentIssueCode`.

In `ContentValidator.validatePoem`, after completeness validation and before `charRefs` validation, compute the candidate identity and add one issue for every matching active poem:

```java
String identity = PoemIdentity.of(payload.author(), payload.lines());
catalog.stream()
    .filter(entry -> entry.type() == ContentType.POEM)
    .filter(entry -> entry.status() == ContentStatus.ACTIVE)
    .map(entry -> new ParsedPoem(entry, parseQuietly(entry, PoemPayload.class)))
    .filter(entry -> entry.payload() != null)
    .filter(entry -> identity.equals(
        PoemIdentity.of(entry.payload().author(), entry.payload().lines())))
    .forEach(entry ->
        issues.add(
            new ContentIssue(
                ContentIssueCode.POEM_BODY_DUPLICATE,
                item.id(),
                "/payload/lines",
                "poem duplicates active content: " + entry.item().id())));
```

Add:

```java
private record ParsedPoem(ContentItemView item, PoemPayload payload) {}
```

- [ ] **Step 5: Run focused and full backend tests**

Run:

```bash
cd backend
mvn -pl modules/content,modules/operations -am \
  -Dtest=PoemIdentityTest,ContentValidatorTest,ContentAuthoringServiceTest \
  -Dsurefire.failIfNoSpecifiedTests=false test
mvn test
```

Expected: all focused tests and the full backend suite pass.

- [ ] **Step 6: Run specification and quality reviews**

Confirm only `ACTIVE` `POEM` entries block activation, malformed catalog payloads remain ignored as before, duplicate target IDs appear in messages, and failure occurs before `changeStatus` or audit recording. Review Unicode category parity against all shared vectors.

- [ ] **Step 7: Commit Task 2**

```bash
/opt/homebrew/bin/git add \
  backend/modules/content/src/main/java/com/childedu/chinese/content/domain/PoemIdentity.java \
  backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentIssueCode.java \
  backend/modules/content/src/main/java/com/childedu/chinese/content/domain/ContentValidator.java \
  backend/modules/content/src/test/java/com/childedu/chinese/content/PoemIdentityTest.java \
  backend/modules/content/src/test/java/com/childedu/chinese/content/ContentValidatorTest.java \
  backend/modules/operations/src/test/java/com/childedu/chinese/operations/ContentAuthoringServiceTest.java
/opt/homebrew/bin/git commit -m "feat(content): block duplicate poem activation"
```

---

### Task 3: Deterministic Review Checklist Builder

**Files:**
- Create: `frontend/packages/content-cli/src/poem-review.ts`
- Create: `frontend/packages/content-cli/test/poem-review.test.ts`

**Interfaces:**
- Consumes: `poemIdentity`, `sha256Text`, and `canonicalJsonSha256` from Task 1.
- Consumes: candidate NDJSON and an admin poem catalog snapshot.
- Produces: `classifyPoemReview(input): ClassifiedPoemReview`
- Produces: `finalizePoemReview(classified, validationById): PoemReviewEntry[]`
- Produces: `parsePoemReview(text): PoemReviewEntry[]`
- Produces: `serializePoemReview(entries): string`
- Produces: `serializePoemReviewSummary(entries, candidateSha256, checklistSha256): string`

- [ ] **Step 1: Define tests and fixture builders**

Create `poem-review.test.ts` with typed candidate/admin factories. The happy path must build 320 candidates, 23 active poems, and exactly 10 duplicate identities. Assert:

```ts
const classified = classifyPoemReview({
  candidateText: candidateNdjson(candidates),
  catalog: [...activePoems, ...draftItems],
  expectedCandidateSha256: sha256Text(candidateNdjson(candidates)),
});
const validations = new Map(
  classified.entries
    .filter(({ decision }) => decision === "ACTIVATE")
    .map(({ id }) => [id, { valid: true, issues: [] }] as const),
);
const entries = finalizePoemReview(classified, validations);

expect(entries).toHaveLength(320);
expect(entries.filter(({ decision }) => decision === "ACTIVATE")).toHaveLength(310);
expect(
  entries.filter(({ decision }) => decision === "ARCHIVE_DUPLICATE"),
).toHaveLength(10);
expect(entries.map(({ id }) => id)).toEqual(
  [...entries.map(({ id }) => id)].sort(),
);
expect(parsePoemReview(serializePoemReview(entries))).toEqual(entries);
```

Add separate tests that reject:

- candidate count other than 320;
- mixed rule version or source;
- duplicate candidate ID, author+title, or poem identity;
- missing backend item;
- non-DRAFT backend item during generation;
- revision/level/difficulty/promotion/tags/payload drift;
- zero or more than one active duplicate target for a duplicate decision;
- decision counts other than 310/10;
- missing, invalid, extra, or issue-bearing validation responses;
- malformed, unsorted, duplicate-ID, or wrong-count checklist input;
- non-deterministic summary ordering.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-review.test.ts
```

Expected: FAIL because `../src/poem-review` does not exist.

- [ ] **Step 3: Implement explicit review types and classification**

Create `poem-review.ts` with these public types:

```ts
export type ContentStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface AdminPoemItem {
  id: string;
  type: "POEM";
  status: ContentStatus;
  revision: number;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  difficulty: "L1" | "L2" | "L3" | "L4" | "L5";
  promotionRequired: boolean;
  tags: string[];
  payload: {
    title: string;
    author: string;
    lines: string[];
    charRefs: string[];
    source?: {
      sourceId: string;
      dynasty: string;
      category: string;
      sourceUrl: string;
    };
  };
}

export interface ValidationResponse {
  valid: boolean;
  issues: Array<{ code: string; itemId: string; path: string; message: string }>;
}

export interface PoemReviewEntry {
  id: string;
  expectedRevision: number;
  expectedStatus: "DRAFT";
  title: string;
  author: string;
  sourceId: string;
  sourceHash: string;
  payloadHash: string;
  poemIdentityHash: string;
  decision: "ACTIVATE" | "ARCHIVE_DUPLICATE";
  checks: Array<
    | "SOURCE_MATCH"
    | "FIELDS_COMPLETE"
    | "CANDIDATE_TITLE_UNIQUE"
    | "CANDIDATE_BODY_UNIQUE"
    | "BACKEND_PAYLOAD_MATCH"
    | "CONTENT_VALID"
    | "ACTIVE_DUPLICATE_CONFIRMED"
  >;
  duplicateOf: string | null;
}

export type ClassifiedPoemReviewEntry = Omit<PoemReviewEntry, "checks">;

export interface ClassifiedPoemReview {
  candidateSha256: string;
  entries: ClassifiedPoemReviewEntry[];
}
```

Use exact constants:

```ts
const EXPECTED_CANDIDATE_COUNT = 320;
const EXPECTED_ACTIVATE_COUNT = 310;
const EXPECTED_ARCHIVE_COUNT = 10;
const RULE_VERSION = "guwendao-tang-poem-v2";
const SOURCE = "GUWENDAO_TANG";
```

Parse every non-empty NDJSON line, validate all candidate fields, compare the complete backend projection, index active poems by `poemIdentity`, and sort entries by Unicode code-unit ID order using `left.id < right.id ? -1 : left.id > right.id ? 1 : 0`.

- [ ] **Step 4: Implement finalization and deterministic serializers**

`finalizePoemReview` must require exactly one valid zero-issue response for every `ACTIVATE` ID and no responses for archive IDs. It appends the five common checks plus `CONTENT_VALID` to activation entries, or the five common checks plus `ACTIVE_DUPLICATE_CONFIRMED` to archive entries, without mutating classified entries.

`serializePoemReview` emits one compact JSON object per line and one terminal newline. `parsePoemReview` re-validates every field, order, uniqueness, counts, fixed checks, and decision/`duplicateOf` consistency.

`serializePoemReviewSummary` uses actual function arguments rather than runtime timestamps:

```ts
const heading = [
  "# Guwendao 唐诗审核摘要",
  "",
  "- Rule version: `guwendao-poem-review-v1`",
  `- Candidate SHA-256: \`${candidateSha256}\``,
  `- Checklist SHA-256: \`${checklistSha256}\``,
  "- Total: 320",
  "- Activate: 310",
  "- Archive duplicate: 10",
  "",
  "## Duplicate Mapping",
  "",
  "| Candidate | Title | Author | Active target |",
  "| --- | --- | --- | --- |",
];
```

The implementation fills all hashes and rows; no timestamps are included so repeated generation is byte-identical.

- [ ] **Step 5: Run focused tests, full coverage, and typecheck**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-review.test.ts
pnpm test:cov
pnpm typecheck
```

Expected: all tests pass and coverage remains 100%.

- [ ] **Step 6: Run specification and quality reviews**

Confirm the builder cannot infer an approval when validation evidence is missing, cannot classify ambiguous active duplicates, compares the full backend projection, and uses deterministic order and serialization. Review parsing errors for line number and field path.

- [ ] **Step 7: Commit Task 3**

```bash
/opt/homebrew/bin/git add \
  frontend/packages/content-cli/src/poem-review.ts \
  frontend/packages/content-cli/test/poem-review.test.ts
/opt/homebrew/bin/git commit -m "feat(content): build poem review checklist"
```

---

### Task 4: Resumable Review Application Service

**Files:**
- Create: `frontend/packages/content-cli/src/poem-review-admin.ts`
- Create: `frontend/packages/content-cli/src/poem-review-application.ts`
- Create: `frontend/packages/content-cli/test/poem-review-application.test.ts`

**Interfaces:**
- Consumes: parsed `PoemReviewEntry[]`.
- Produces: `PoemReviewAdminPort`.
- Produces: `generatePoemReview(input): Promise<GeneratedPoemReview>`.
- Produces: `applyPoemReview(input): Promise<PoemReviewExecutionReport>`.
- Produces: `PoemReviewExecutionError` carrying a report.

- [ ] **Step 1: Define the admin port**

Create `poem-review-admin.ts`:

```ts
import type { AdminPoemItem, ValidationResponse } from "./poem-review";

export interface PoemReviewAdminPort {
  listPoems(): Promise<AdminPoemItem[]>;
  validate(id: string): Promise<ValidationResponse>;
  activate(id: string, expectedRevision: number): Promise<AdminPoemItem>;
  archive(id: string, expectedRevision: number): Promise<AdminPoemItem>;
}
```

- [ ] **Step 2: Write failing generation, preflight, resume, and failure tests**

Create `poem-review-application.test.ts` with an in-memory port that records calls and mutates item status only after successful actions.

Cover:

```ts
it("does no writes when any preflight item drifted", async () => {
  port.items.get("sc-gwd-0001")!.revision = 2;
  const now = () => new Date("2026-10-08T00:00:00Z");
  await expect(
    applyPoemReview({
      checklistText,
      admin: port,
      now,
    }),
  ).rejects.toMatchObject({
    report: { activated: 0, archived: 0, failed: 1 },
  });
  expect(port.activateCalls).toEqual([]);
  expect(port.archiveCalls).toEqual([]);
});

it("archives ten before activating three hundred ten", async () => {
  const report = await applyPoemReview({ checklistText, admin: port, now });
  expect(port.actionCalls.slice(0, 10).every(({ action }) => action === "archive"))
    .toBe(true);
  expect(report).toMatchObject({
    activated: 310,
    archived: 10,
    skipped: 0,
    failed: 0,
  });
});

it("skips matching target states and resumes remaining drafts", async () => {
  for (const entry of archiveEntries.slice(0, 4)) {
    port.items.get(entry.id)!.status = "ARCHIVED";
  }
  for (const entry of activateEntries.slice(0, 100)) {
    port.items.get(entry.id)!.status = "ACTIVE";
  }
  const report = await applyPoemReview({ checklistText, admin: port, now });
  expect(report.skipped).toBe(104);
  expect(report.archived).toBe(6);
  expect(report.activated).toBe(210);
});
```

Also test:

- every `ACTIVATE` entry is validated during preflight;
- invalid validation stops all writes;
- duplicate target missing or no longer active stops all writes;
- wrong status, revision, payload hash, or identity hash stops all writes;
- 409, 422, 403, malformed response, and network failures stop at the first action and preserve earlier results in the attached report;
- successful action responses must retain revision/payload and reach the requested state;
- postflight requires total `POEM/ACTIVE = 333`, `sc-gwd ACTIVE = 310`, `ARCHIVED = 10`, `DRAFT = 0`, and zero duplicate active identities.

- [ ] **Step 3: Run the focused test and confirm the red state**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-review-application.test.ts
```

Expected: FAIL because the application module does not exist.

- [ ] **Step 4: Implement generation orchestration**

Implement:

```ts
export async function generatePoemReview(input: {
  candidateText: string;
  expectedCandidateSha256: string;
  admin: PoemReviewAdminPort;
}): Promise<{
  entries: PoemReviewEntry[];
  checklistText: string;
  summaryText: string;
}> {
  const catalog = await input.admin.listPoems();
  const classified = classifyPoemReview({
    candidateText: input.candidateText,
    catalog,
    expectedCandidateSha256: input.expectedCandidateSha256,
  });
  const validationById = new Map<string, ValidationResponse>();
  for (const entry of classified.entries) {
    if (entry.decision === "ACTIVATE") {
      validationById.set(entry.id, await input.admin.validate(entry.id));
    }
  }
  const entries = finalizePoemReview(classified, validationById);
  const checklistText = serializePoemReview(entries);
  return {
    entries,
    checklistText,
    summaryText: serializePoemReviewSummary(
      entries,
      sha256Text(input.candidateText),
      sha256Text(checklistText),
    ),
  };
}
```

- [ ] **Step 5: Implement all-preflight execution and reports**

Define report types:

```ts
export interface PoemReviewExecutionReport {
  checklistSha256: string;
  startedAt: string;
  finishedAt: string;
  activated: number;
  archived: number;
  skipped: number;
  failed: number;
  results: Array<{
    id: string;
    decision: PoemReviewEntry["decision"];
    result: "ACTIVATED" | "ARCHIVED" | "SKIPPED_ALREADY_APPLIED" | "FAILED";
    error?: string;
  }>;
  verification?: {
    activePoems: number;
    activeCandidates: number;
    archivedCandidates: number;
    draftCandidates: number;
    duplicateActiveGroups: number;
  };
}
```

Implementation order:

1. Parse and hash checklist.
2. Fetch one complete poem snapshot.
3. Verify every candidate and duplicate target.
4. Call `validate` for all 310 activation decisions.
5. If any preflight check fails, throw `PoemReviewExecutionError` before writes.
6. Execute archive entries by ID.
7. Execute activate entries by ID.
8. Treat already matching final states as skips.
9. After actions, fetch a fresh snapshot and enforce all final counts and zero duplicate groups.
10. Return the report; on first action/postflight failure throw an error carrying the partial report.

Both application functions take `now: () => Date` only where report
timestamps are needed; tests pass a fixed function, and production passes
`() => new Date()`.

- [ ] **Step 6: Run focused tests, full coverage, and typecheck**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/poem-review-application.test.ts
pnpm test:cov
pnpm typecheck
```

Expected: all tests pass and coverage remains 100%.

- [ ] **Step 7: Run specification and quality reviews**

Confirm no write method is reachable before all preflight promises succeed; target-state skips still verify revision and payload; the first failed action halts iteration; postflight uses the same identity contract; reports never contain credentials.

- [ ] **Step 8: Commit Task 4**

```bash
/opt/homebrew/bin/git add \
  frontend/packages/content-cli/src/poem-review-admin.ts \
  frontend/packages/content-cli/src/poem-review-application.ts \
  frontend/packages/content-cli/test/poem-review-application.test.ts
/opt/homebrew/bin/git commit -m "feat(content): apply poem review decisions"
```

---

### Task 5: HTTP Adapter And CLI Commands

**Files:**
- Create: `frontend/packages/content-cli/src/adapters/http-poem-review-admin.ts`
- Create: `frontend/packages/content-cli/src/adapters/atomic-file.ts`
- Modify: `frontend/packages/content-cli/src/bin.ts`
- Modify: `frontend/packages/content-cli/test/bin.test.ts`

**Interfaces:**
- Consumes: Task 4 application functions.
- Produces: `createHttpPoemReviewAdmin({ baseUrl, token }): PoemReviewAdminPort`.
- Produces CLI: `poem-review-checklist --in --out --summary --admin-url --admin-token`.
- Produces CLI: `apply-poem-review --in --report --admin-url --admin-token`.

- [ ] **Step 1: Write failing HTTP boundary tests**

Extend `bin.test.ts` with a mock server that:

- paginates `GET /v1/admin/content/items?type=POEM&limit=100`;
- serves `POST /{id}/validate`;
- records `POST /{id}/archive?expectedRevision=N`;
- records `POST /{id}/activate?expectedRevision=N`;
- verifies `X-Admin-Token` exists and `X-Actor` is absent.

Add command tests:

```ts
expect(
  await run(
    [
      "poem-review-checklist",
      "--in", candidatePath,
      "--out", checklistPath,
      "--summary", summaryPath,
      "--admin-url", server.url,
      "--admin-token", "secret-token",
    ],
    {},
    output,
  ),
).toBe(0);

expect(
  await run(
    [
      "apply-poem-review",
      "--in", checklistPath,
      "--report", reportPath,
      "--admin-url", server.url,
      "--admin-token", "secret-token",
    ],
    {},
    output,
  ),
).toBe(0);
```

Assert output files are complete and terminal-newline normalized, reports contain `310/10/0`, duplicate runs report 320 skips, invalid options return code 2, HTTP/preflight failures return code 1, temporary files and locks are removed, existing outputs survive failed generation, and no output/error includes `secret-token`.

- [ ] **Step 2: Run focused CLI tests and confirm the red state**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts \
  -t "poem review"
```

Expected: FAIL because both commands and the HTTP adapter are absent.

- [ ] **Step 3: Implement the HTTP adapter**

Create `http-poem-review-admin.ts` with one request helper. For non-2xx responses, read the body, replace every exact token occurrence with `[REDACTED]`, and throw:

```ts
const body = await response.text();
const safeBody =
  config.token.length === 0
    ? body
    : body.split(config.token).join("[REDACTED]");
throw new Error(
  `content admin ${method} ${path} failed: HTTP ${response.status} ${safeBody}`,
);
```

Use `encodeURIComponent(id)` and `URLSearchParams`. `listPoems()` follows `nextCursor` until null, rejects duplicate IDs, and requests exactly `type=POEM&limit=100`. All requests send only:

```ts
{
  "Content-Type": "application/json",
  "X-Admin-Token": config.token,
}
```

- [ ] **Step 4: Implement reusable atomic text writing**

Create `atomic-file.ts`:

```ts
export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let lock: FileHandle | undefined;
  try {
    lock = await open(lockPath, "wx");
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
    if (lock !== undefined) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
```

- [ ] **Step 5: Wire both CLI commands**

Add exact usage strings:

```ts
const poemReviewChecklistUsage =
  "usage: cc-content poem-review-checklist --in <candidates.ndjson> --out <review.ndjson> --summary <summary.md> --admin-url <url> --admin-token <token>";
const applyPoemReviewUsage =
  "usage: cc-content apply-poem-review --in <review.ndjson> --report <report.json> --admin-url <url> --admin-token <token>";
```

The checklist command reads candidate text, passes the fixed SHA
`b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def`,
generates both outputs fully in memory, then atomically writes the summary
first and the authoritative checklist last. A summary-write failure therefore
leaves the existing checklist untouched.

The apply command always atomically writes the returned or exception-attached report as formatted JSON plus a terminal newline. It logs only counts and file paths.

- [ ] **Step 6: Run CLI tests and full frontend gates**

Run:

```bash
cd frontend
pnpm exec vitest run packages/content-cli/test/bin.test.ts -t "poem review"
pnpm test
pnpm test:cov
pnpm typecheck
```

Expected: all tests, 100% coverage, and typecheck pass.

- [ ] **Step 7: Run specification and quality reviews**

Confirm pagination is complete, paths and query parameters are encoded, the token is header-only and redacted, output replacement happens only after generation succeeds, and CLI business logic remains in covered modules rather than `bin.ts`.

- [ ] **Step 8: Commit Task 5**

```bash
/opt/homebrew/bin/git add \
  frontend/packages/content-cli/src/adapters/http-poem-review-admin.ts \
  frontend/packages/content-cli/src/adapters/atomic-file.ts \
  frontend/packages/content-cli/src/bin.ts \
  frontend/packages/content-cli/test/bin.test.ts
/opt/homebrew/bin/git commit -m "feat(content): add poem review commands"
```

---

### Task 6: Generate And Guard The Review Artifacts

**Files:**
- Create: `frontend/content/reviews/poems-guwendao-tang-320-review.ndjson`
- Create: `frontend/content/reviews/poems-guwendao-tang-320-review-summary.md`
- Create: `frontend/content/test/guwendao-poem-review.test.ts`

**Interfaces:**
- Consumes: running admin API, candidate SHA `b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def`, and Tasks 1-5.
- Produces: tracked 320-line checklist and deterministic summary.

- [ ] **Step 1: Start the updated backend on port 8082**

Build and run against the existing MySQL without printing credentials:

```bash
docker build \
  -t chinese-garden-backend:poem-review \
  /Users/bytedance/workspace/individual/child_edu/chinese-garden/backend

docker run --rm -d \
  --name chinese-garden-poem-review-backend \
  --network chinese-garden \
  -p 127.0.0.1:8082:8080 \
  -e 'DB_URL=jdbc:mysql://chinese-garden-mysql:3306/childedu?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC' \
  -e DB_USER=childedu \
  -e DB_PASSWORD="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-mysql | sed -n 's/^MYSQL_PASSWORD=//p')" \
  -e ADMIN_TOKEN="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')" \
  -e JWT_SECRET_BASE64="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^JWT_SECRET_BASE64=//p')" \
  -e 'ADMIN_ALLOWED_IPS=127.0.0.1,172.16.0.0/12,192.168.0.0/16' \
  -v '/Users/bytedance/workspace/individual/child_edu/chinese-garden/frontend/content:/app/content:ro' \
  chinese-garden-backend:poem-review
```

Poll `http://127.0.0.1:8082/actuator/health` until it returns `"status":"UP"`.

- [ ] **Step 2: Write the failing repository artifact test**

Create `frontend/content/test/guwendao-poem-review.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePoemReview } from "../../packages/content-cli/src/poem-review";
import { sha256Text } from "../../packages/content-cli/src/poem-identity";

const candidatePath = new URL(
  "../candidates/poems-guwendao-tang-320.ndjson",
  import.meta.url,
);
const reviewPath = new URL(
  "../reviews/poems-guwendao-tang-320-review.ndjson",
  import.meta.url,
);

function parseCandidateIds(text: string): string[] {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => (JSON.parse(line) as { id: string }).id);
}

describe("Guwendao poem review artifact", () => {
  it("locks the review decisions to the candidate snapshot", () => {
    const candidateText = readFileSync(candidatePath, "utf8");
    const reviewText = readFileSync(reviewPath, "utf8");
    const reviews = parsePoemReview(reviewText);
    const candidates = parseCandidateIds(candidateText);

    expect(sha256Text(candidateText)).toBe(
      "b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def",
    );
    expect(sha256Text(reviewText)).toBe(
      "32d30bcd7c16ecf2c0bcd97a6d377eab17ac8a8d56d047bfd16b8223a367ee57",
    );
    expect(reviews.map(({ id }) => id).sort()).toEqual(candidates.sort());
    expect(
      reviews.filter(({ decision }) => decision === "ACTIVATE"),
    ).toHaveLength(310);
    expect(
      reviews
        .filter(({ decision }) => decision === "ARCHIVE_DUPLICATE")
        .map(({ id, title, author, duplicateOf }) => ({
          id,
          title,
          author,
          duplicateOf,
        })),
    ).toEqual([
      {
        id: "sc-gwd-0f81015a040c",
        title: "早发白帝城",
        author: "李白",
        duplicateOf: "sc-zaofabaidicheng",
      },
      {
        id: "sc-gwd-40954072f541",
        title: "寻隐者不遇",
        author: "贾岛",
        duplicateOf: "sc-xunyinzhe",
      },
      {
        id: "sc-gwd-58313be2d918",
        title: "江雪",
        author: "柳宗元",
        duplicateOf: "sc-jiangxue",
      },
      {
        id: "sc-gwd-c35a60c1a8e2",
        title: "静夜思",
        author: "李白",
        duplicateOf: "sc-jingyesi",
      },
      {
        id: "sc-gwd-c90ff9ea5a71",
        title: "登鹳雀楼",
        author: "王之涣",
        duplicateOf: "sc-dengguanquelou",
      },
      {
        id: "sc-gwd-ccee5691ba93",
        title: "春晓",
        author: "孟浩然",
        duplicateOf: "sc-chunxiao",
      },
      {
        id: "sc-gwd-e9b1a8b4def0",
        title: "鹿柴",
        author: "王维",
        duplicateOf: "sc-luzhai",
      },
      {
        id: "sc-gwd-ee9af27de9f2",
        title: "登乐游原",
        author: "李商隐",
        duplicateOf: "sc-dengleyouyuan",
      },
      {
        id: "sc-gwd-f324eea45183",
        title: "相思",
        author: "王维",
        duplicateOf: "sc-xiangsi",
      },
      {
        id: "sc-gwd-f459f8ed8d23",
        title: "回乡偶书",
        author: "贺知章",
        duplicateOf: "sc-huixiangoushu",
      },
    ]);
  });
});
```

The expected SHA and all 10 mappings above are derived from the current
read-only admin snapshot and the serialization contract defined in Task 3.
If generation differs, stop and reconcile the implementation with the
contract; do not update the expected values merely to make the test pass.

- [ ] **Step 3: Run the repository test and confirm the red state**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/guwendao-poem-review.test.ts
```

Expected: FAIL because
`content/reviews/poems-guwendao-tang-320-review.ndjson` does not exist.

- [ ] **Step 4: Generate the review files**

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  poem-review-checklist \
  --in content/candidates/poems-guwendao-tang-320.ndjson \
  --out content/reviews/poems-guwendao-tang-320-review.ndjson \
  --summary content/reviews/poems-guwendao-tang-320-review-summary.md \
  --admin-url http://127.0.0.1:8082 \
  --admin-token "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
```

Expected log: `poem-review-checklist: total=320 activate=310 archive=10`.

- [ ] **Step 5: Run the repository test and make it green**

Run:

```bash
cd frontend
pnpm exec vitest run content/test/guwendao-poem-review.test.ts
```

Expected: PASS with exact artifact hash and all 10 duplicate mappings.

- [ ] **Step 6: Regenerate and prove determinism**

Save both SHA-256 values, run the generation command again, and compare:

```bash
shasum -a 256 \
  content/reviews/poems-guwendao-tang-320-review.ndjson \
  content/reviews/poems-guwendao-tang-320-review-summary.md
```

Expected: hashes before and after regeneration are identical.

- [ ] **Step 7: Run full frontend gates**

```bash
cd frontend
pnpm test
pnpm test:cov
pnpm typecheck
```

Expected: all tests pass and coverage remains 100%.

- [ ] **Step 8: Run specification and quality reviews**

Inspect all 320 decisions, the 10 duplicate mappings, candidate/checklist hashes, source IDs, expected revisions, payload hashes, and summary counts. Confirm no runtime state changed during generation.

- [ ] **Step 9: Commit Task 6**

```bash
/opt/homebrew/bin/git add \
  frontend/content/reviews/poems-guwendao-tang-320-review.ndjson \
  frontend/content/reviews/poems-guwendao-tang-320-review-summary.md \
  frontend/content/test/guwendao-poem-review.test.ts
/opt/homebrew/bin/git commit -m "data(content): add Guwendao poem review"
```

---

### Task 7: Apply Decisions And Verify Runtime State

**Files:**
- Create: `frontend/content/reviews/poems-guwendao-tang-320-activation-report.json`
- No other source files modified.

**Interfaces:**
- Consumes: tracked checklist and updated backend from Tasks 1-6.
- Produces: 310 `ACTIVE`, 10 `ARCHIVED`, zero `DRAFT` `sc-gwd-*` rows and complete audit evidence.

- [ ] **Step 1: Run all automated verification before writes**

```bash
cd backend
mvn test

cd ../frontend
pnpm test
pnpm test:cov
pnpm typecheck
```

Expected: all backend/frontend tests, coverage gates, and typecheck pass.

- [ ] **Step 2: Capture exact pre-migration database invariants**

```bash
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "
    SELECT type, status, COUNT(*)
    FROM content_item
    GROUP BY type, status
    ORDER BY type, status;
    SELECT action, COUNT(*)
    FROM admin_audit_log
    WHERE target LIKE '\''sc-gwd-%'\''
      AND action IN ('\''ACTIVATE'\'', '\''ARCHIVE'\'')
    GROUP BY action;
  "'
```

Expected before first execution: `POEM ACTIVE 23`, `POEM DRAFT 320`, no prior `ACTIVATE` or `ARCHIVE` rows for `sc-gwd-*`. If target states already exist, do not reset them; continue as an idempotent recovery run and report the baseline.

- [ ] **Step 3: Apply the complete checklist**

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  apply-poem-review \
  --in content/reviews/poems-guwendao-tang-320-review.ndjson \
  --report content/reviews/poems-guwendao-tang-320-activation-report.json \
  --admin-url http://127.0.0.1:8082 \
  --admin-token "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
```

Expected first-run log: `activated=310 archived=10 skipped=0 failed=0`.

- [ ] **Step 4: Verify persistence and audit counts**

```bash
docker exec chinese-garden-mysql sh -lc \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "
    SELECT status, COUNT(*)
    FROM content_item
    WHERE id LIKE '\''sc-gwd-%'\''
    GROUP BY status
    ORDER BY status;
    SELECT COUNT(*)
    FROM content_item
    WHERE type='\''POEM'\'' AND status='\''ACTIVE'\'';
    SELECT action, COUNT(*)
    FROM admin_audit_log
    WHERE target LIKE '\''sc-gwd-%'\''
      AND action IN ('\''ACTIVATE'\'', '\''ARCHIVE'\'')
      AND success = TRUE
    GROUP BY action
    ORDER BY action;
    SELECT target,
           JSON_UNQUOTE(JSON_EXTRACT(before_json, '\''$.status'\'')),
           JSON_UNQUOTE(JSON_EXTRACT(after_json, '\''$.status'\'')),
           JSON_EXTRACT(before_json, '\''$.revision'\''),
           JSON_EXTRACT(after_json, '\''$.revision'\'')
    FROM admin_audit_log
    WHERE target IN ('\''sc-gwd-45c396367f59'\'', '\''sc-gwd-c90ff9ea5a71'\'')
      AND action IN ('\''ACTIVATE'\'', '\''ARCHIVE'\'')
    ORDER BY id DESC;
  "'
```

Expected:

- `ACTIVE 310`;
- `ARCHIVED 10`;
- no `DRAFT` row;
- all `POEM / ACTIVE = 333`;
- successful audit rows are `ACTIVATE 310` and `ARCHIVE 10`;
- sampled before/after transitions are `DRAFT -> ACTIVE` or `DRAFT -> ARCHIVED`;
- sampled revision values are unchanged.

- [ ] **Step 5: Verify application report and semantic uniqueness**

Read `poems-guwendao-tang-320-activation-report.json` and assert:

```text
activated=310
archived=10
skipped=0
failed=0
verification.activePoems=333
verification.activeCandidates=310
verification.archivedCandidates=10
verification.draftCandidates=0
verification.duplicateActiveGroups=0
```

Also compare the report checklist hash with `shasum -a 256` of the tracked NDJSON.

- [ ] **Step 6: Prove idempotent recovery without replacing the first-run report**

Run `apply-poem-review` again with the same checklist and API parameters, but
write the report to
`/tmp/poems-guwendao-tang-320-idempotency-report.json`.

```bash
cd frontend
pnpm exec tsx packages/content-cli/src/bin.ts \
  apply-poem-review \
  --in content/reviews/poems-guwendao-tang-320-review.ndjson \
  --report /tmp/poems-guwendao-tang-320-idempotency-report.json \
  --admin-url http://127.0.0.1:8082 \
  --admin-token "$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' chinese-garden-backend | sed -n 's/^ADMIN_TOKEN=//p')"
```

Expected: `activated=0 archived=0 skipped=320 failed=0`; database counts and audit counts do not increase.

- [ ] **Step 7: Run final repository checks**

```bash
cd backend
mvn test

cd ../frontend
pnpm test
pnpm test:cov
pnpm typecheck

cd ..
/opt/homebrew/bin/git diff --check
/opt/homebrew/bin/git status --short
```

Expected: all tests pass; only the activation report plus pre-existing unrelated files are uncommitted.

- [ ] **Step 8: Commit the execution report**

```bash
/opt/homebrew/bin/git add \
  frontend/content/reviews/poems-guwendao-tang-320-activation-report.json
/opt/homebrew/bin/git commit -m "data(content): record Guwendao poem activation"
```

- [ ] **Step 9: Stop the temporary backend and report**

```bash
docker stop chinese-garden-poem-review-backend
```

Report all implementation commit IDs, checklist/report SHA-256 values, final status and audit counts, duplicate-group count, idempotent rerun result, test/coverage/typecheck results, and untouched pre-existing worktree changes.
