# Challenge Disjoint Decks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status:** Completed and verified on 2026-09-16.

**Goal:** Ensure child and guardian challenge turns never receive the same poem or idiom while preserving fair counts and deterministic recovery.

**Architecture:** The domain deck module will build participant-specific candidate decks, then allocate one shared knowledge-point pool into two disjoint decks. The challenge engine will continue resolving a participant deck on demand, so persisted sessions remain compact and deterministic.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, React, Taro

## Global Constraints

- Deduplicate across participants by `knowledgePointId`, not generated question text or question type.
- Fixed races allocate exactly `questionCount` entries to each participant.
- Timed challenges split all shared eligible knowledge points with a capacity difference of at most one.
- Preserve deterministic output for the same challenge ID, config, and corpus.
- Keep Playground and miniapp behavior and copy aligned.
- Do not change challenge persistence, answer event, or settlement data shapes.
- Follow TDD and maintain the domain package's 100% coverage requirement.
- Do not create intermediate commits; the repository preference is one final commit after full verification.

---

### Task 1: Specify Paired Deck Allocation

**Files:**
- Modify: `frontend/packages/domain/test/challenge.deck.test.ts`
- Modify: `frontend/packages/domain/src/challenge/deck.ts`
- Modify: `frontend/packages/domain/src/challenge/types.ts`

**Interfaces:**
- Consumes: `buildChallengeDeck(challengeId, config, participant, corpus)`
- Produces: `buildChallengeDecks(challengeId, config, corpus): ChallengeDecks`
- Produces: `ChallengeCapacityError.required` and `ChallengeCapacityError.available`

- [ ] **Step 1: Write a failing fixed-race allocation test**

Add a test that calls `buildChallengeDecks` with `questionCount: 4`, asserts both decks
have four entries, and asserts the child and parent knowledge-point sets have no
intersection.

- [ ] **Step 2: Run the deck test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run packages/domain/test/challenge.deck.test.ts
```

Expected: FAIL because `buildChallengeDecks` is not exported.

- [ ] **Step 3: Implement the minimal paired allocator**

Extract the current algorithm into a private candidate-deck builder. Add
`buildChallengeDecks`, alternate deterministic picks from each participant's candidate
order, and make `buildChallengeDeck` select from the paired result.

- [ ] **Step 4: Run the deck test and verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run packages/domain/test/challenge.deck.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add timed balancing and capacity slices**

Add tests proving timed decks are disjoint and differ by at most one entry, fixed races
require `questionCount * 2` shared entries, and participant difficulty preferences remain
first where matching content exists. Implement only the additional allocation and error
behavior required by each failing test.

- [ ] **Step 6: Bump the challenge rule version**

Change `CHALLENGE_RULE_VERSION` from `challenge-v4` to `challenge-v5` so an old active
session cannot resume against the new deck mapping.

### Task 2: Verify Engine Behavior and Recovery

**Files:**
- Modify: `frontend/packages/domain/src/challenge/engine.ts`
- Modify: `frontend/packages/domain/test/challenge.engine.test.ts`

**Interfaces:**
- Consumes: `buildChallengeDecks(challengeId, config, corpus)`
- Produces: unchanged `challengeTurnQuestionCount` and `questionForTurn`

- [ ] **Step 1: Write a failing end-to-end turn test**

Run both fixed-race turns through `questionForTurn` and `submitChallengeAnswer`, collect
their knowledge-point IDs, and assert equal counts plus an empty intersection.

- [ ] **Step 2: Run the engine test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run packages/domain/test/challenge.engine.test.ts
```

Expected: FAIL because current independent decks can overlap.

- [ ] **Step 3: Read the paired deck from the engine**

Resolve both decks once per deterministic call through `buildChallengeDecks`, then select
`child` or `parent` from the active turn. Keep the session data shape unchanged.

- [ ] **Step 4: Add deterministic recovery coverage**

Assert repeated `questionForTurn` calls on an unchanged session return the same generated
question, including after pause and resume.

- [ ] **Step 5: Run the engine test and verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run packages/domain/test/challenge.engine.test.ts
```

Expected: PASS.

### Task 3: Align Integration and Error Presentation

**Files:**
- Modify: `frontend/apps/playground/test/ChallengeDeck.integration.test.ts`
- Modify: `frontend/apps/playground/src/pages/ChallengePage.tsx`
- Modify: `frontend/apps/playground/test/ChallengePage.test.tsx`
- Modify: `frontend/apps/miniapp/src/pages/challenge/index.tsx`
- Modify: `frontend/apps/miniapp/test/ChallengePage.test.tsx`

**Interfaces:**
- Consumes: `ChallengeCapacityError.required` and `ChallengeCapacityError.available`
- Produces: identical capacity error copy in both clients

- [ ] **Step 1: Strengthen the published-corpus integration test**

Build both decks for each dimension and tier, assert each has ten entries, and assert the
combined twenty IDs are unique.

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run apps/playground/test/ChallengeDeck.integration.test.ts
```

Expected: FAIL until the paired allocator is wired through the public API.

- [ ] **Step 3: Update capacity error component tests**

Change both page expectations to
`当前题库只有 5 道，亲子不重复答题至少需要 20 道` for their sparse fixtures.

- [ ] **Step 4: Render error counts from the domain error**

Use `error.available` and `error.required` in both challenge pages and retain the existing
generic fallback for unrelated failures.

- [ ] **Step 5: Run both page test files**

Run:

```bash
./node_modules/.bin/vitest run apps/playground/test/ChallengePage.test.tsx apps/miniapp/test/ChallengePage.test.tsx
```

Expected: PASS.

### Task 4: Regression and Coverage Verification

**Files:**
- Verify only; fix only failures caused by Tasks 1-3.

**Interfaces:**
- Consumes: all behavior introduced above
- Produces: verified frontend workspace

- [ ] **Step 1: Run focused challenge tests**

```bash
./node_modules/.bin/vitest run packages/domain/test/challenge.deck.test.ts packages/domain/test/challenge.engine.test.ts packages/domain/test/challenge.difficulty.test.ts apps/playground/test/ChallengeDeck.integration.test.ts apps/playground/test/ChallengePage.test.tsx apps/miniapp/test/ChallengePage.test.tsx packages/application/test/challenge.active-challenge.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full coverage**

```bash
./node_modules/.bin/vitest run --coverage --silent
```

Expected: the workspace and modified challenge domain files have 100% statements,
branches, functions, and lines.

- [ ] **Step 3: Run type checking**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the full frontend suite**

```bash
pnpm test
```

Expected: PASS.
