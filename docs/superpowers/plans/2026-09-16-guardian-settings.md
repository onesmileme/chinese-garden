# Guardian Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Completed and verified on 2026-09-17.

**Goal:** Add a shared, persistent guardian settings experience and protected learning-record reset to the Playground and Taro miniapp guardian centers.

**Architecture:** `@cc/application` owns the validated settings snapshot, serialized update store, shared presentation model, preference ports, and learning-record reset use case. Each host provides storage and capability adapters; both guardian pages remain thin subscribers that render the same fields and invoke the same commands.

**Tech Stack:** TypeScript, React 18, Taro 3.6, Vitest, Testing Library, browser/Taro local storage

## Global Constraints

- Keep guardian settings in a versioned storage key separate from learning session state.
- Defaults are background music on, answer sound on, haptics on, and eye protection off.
- Invalid, partial, or old settings snapshots fall back to the complete defaults and are overwritten.
- Serialize rapid writes and preserve the latest requested value; a failed write restores the prior committed value and exposes `设置保存失败，请重试`.
- Background music remains visibly unsupported because the repository has no music asset; do not simulate playback.
- Clear learning records only after explicit confirmation, retain guardian settings, content caches, guest/login identity, and authentication sessions.
- Clear active assessment/daily/challenge state, completion and result snapshots, challenge source/history, progression/day totals, pending events, and quarantined events.
- A failed required delete must leave the in-memory session state unchanged and surface an error.
- Use `累计成长值` in both guardian pages without renaming internal XP fields or event contracts.
- Use switches with at least 64px row height and keep the page section order from the approved design.
- Both parent gates use one shared `2_000ms` constant, show hold progress, and cancel on release, leave/cancel, or unmount.
- Follow vertical-slice TDD; do not create intermediate commits; finish with full typecheck, tests, and 100% covered application logic.

---

### Task 1: Shared Guardian Settings Store

**Files:**
- Create: `frontend/packages/application/src/guardian/settings.ts`
- Create: `frontend/packages/application/src/guardian/presentation.ts`
- Create: `frontend/packages/application/test/guardian.settings.test.ts`
- Modify: `frontend/packages/application/src/index.ts`

**Interfaces:**
- Produces: `GuardianSettings`, `GuardianSettingsSnapshot`, `GuardianSettingsRepository`
- Produces: `GuardianSettingsStore` with `getState()`, `subscribe()`, `ready()`, and `update(key, enabled)`
- Produces: `AudioPreferencePort`, `HapticsPreferencePort`, `ThemePreferencePort`
- Produces: `GUARDIAN_SETTINGS_KEY`, `DEFAULT_GUARDIAN_SETTINGS`, `GUARDIAN_SETTING_ITEMS`, and `PARENT_GATE_HOLD_DURATION_MS`

- [ ] **Step 1: Write the failing restore and validation tests**

Cover a missing snapshot, a complete version-1 snapshot, and invalid snapshots for an old version, a missing field, and a non-boolean field:

```ts
const store = createGuardianSettingsStore({ repository });
await store.ready();
expect(store.getState().settings).toEqual(DEFAULT_GUARDIAN_SETTINGS);
expect(repository.write).toHaveBeenCalledWith({
  version: 1,
  settings: DEFAULT_GUARDIAN_SETTINGS,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
./node_modules/.bin/vitest run packages/application/test/guardian.settings.test.ts
```

Expected: FAIL because `guardian/settings` does not exist.

- [ ] **Step 3: Implement validated initialization**

Define the exact model:

```ts
export interface GuardianSettings {
  backgroundMusicEnabled: boolean;
  answerSoundEnabled: boolean;
  hapticsEnabled: boolean;
  eyeProtectionEnabled: boolean;
}

export interface GuardianSettingsRepository {
  read(): unknown | null;
  write(snapshot: GuardianSettingsSnapshot): void | Promise<void>;
}
```

Initialize from only a complete `{ version: 1, settings }` snapshot. Queue a full-default repair for all other non-null snapshots and expose it through `ready()`.

- [ ] **Step 4: Add one red-green cycle for updates and subscriptions**

Assert a successful `update("answerSoundEnabled", false)` persists the full snapshot, updates state, clears the error, invokes the preference ports, and notifies subscribers only with committed values. Implement only that behavior and rerun the focused test.

- [ ] **Step 5: Add one red-green cycle for serialization and rollback**

Use deferred repository writes to prove two rapid updates execute in order and finish at the last requested value. Reject a write and assert the old committed value remains with `error === "设置保存失败，请重试"`; then prove a later success clears the error.

- [ ] **Step 6: Add the shared presentation model**

Export ordered items for `背景音乐`, `答题音效`, `震动反馈`, and `护眼模式`, including the no-music explanation, plus:

```ts
export const PARENT_GATE_HOLD_DURATION_MS = 2_000;
```

Rerun the focused test and expect PASS.

### Task 2: Atomic Learning Record Reset

**Files:**
- Create: `frontend/packages/application/src/guardian/clear-learning-records.ts`
- Create: `frontend/packages/application/test/guardian.clear-learning-records.test.ts`
- Modify: `frontend/packages/application/src/session/session-state.ts`
- Modify: `frontend/packages/application/src/ports.ts`
- Modify: `frontend/packages/application/src/index.ts`

**Interfaces:**
- Consumes: `SessionState`, `SnapshotStorage`, all exported learning snapshot keys
- Produces: `ClearableEventStore`, `ClearableEventQuarantine`
- Produces: `clearLearningRecords({ session, events, quarantine }): Promise<void>`
- Produces: `SessionState.clearLearningRecords(): void`

- [ ] **Step 1: Write the failing reset-scope test**

Seed every learning snapshot plus an unrelated guardian/content/auth key. Populate in-memory progression, settlement, assessment, daily, and challenge state. After reset, assert all learning state is initial, all learning keys are absent, and unrelated keys remain.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
./node_modules/.bin/vitest run packages/application/test/guardian.clear-learning-records.test.ts
```

Expected: FAIL because the use case and session reset method do not exist.

- [ ] **Step 3: Implement verified session reset**

Remove and verify these keys before changing memory:

```ts
ACTIVE_DAILY_KEY
ACTIVE_ASSESSMENT_KEY
ASSESSMENT_COMPLETED_KEY
ACTIVE_CHALLENGE_KEY
LAST_CHALLENGE_RESULT_KEY
CHALLENGE_SOURCE_KEY
RECENT_CHALLENGES_KEY
```

Reset `lastSession`, `lastSettlement`, `progression`, `settledDayCount`, active records, assessment completion, challenge source/result, greeting, and update notices only after every read returns `null`.

- [ ] **Step 4: Add pending-event and quarantine clearing**

Require clearable variants of the existing ports:

```ts
export interface ClearableEventStore extends EventStore {
  clear(): Promise<void>;
}
export interface ClearableEventQuarantine extends EventQuarantine {
  clear(): Promise<void>;
}
```

The use case awaits both persistent clears before calling `session.clearLearningRecords()`.

- [ ] **Step 5: Add failure consistency tests**

Reject event clearing, quarantine clearing, and one snapshot removal in separate tests. Assert the promise rejects and `session.getState()` remains the original in-memory object in every case. Rerun the focused test and expect PASS.

### Task 3: Playground Adapters and Guardian Page

**Files:**
- Create: `frontend/apps/playground/src/guardian-settings.ts`
- Modify: `frontend/apps/playground/src/mock/platform.ts`
- Modify: `frontend/apps/playground/src/mock/cue-player.ts`
- Modify: `frontend/apps/playground/src/store.ts`
- Modify: `frontend/apps/playground/src/pages/GuardianPage.tsx`
- Modify: `frontend/apps/playground/test/cue-player.test.ts`
- Modify: `frontend/apps/playground/test/GuardianPage.test.tsx`

**Interfaces:**
- Consumes: shared settings store, preference ports, and clear use case
- Produces: `browserGuardianSettings`, browser preference controller, and `clearBrowserLearningRecords`

- [ ] **Step 1: Write failing adapter tests**

Prove settings survive store recreation, storage exceptions reject writes, disabled answer sound skips audio, disabled haptics skips vibration, eye protection updates the document theme marker, and background music reports unsupported.

- [ ] **Step 2: Implement browser settings and capability adapters**

Use `cc_guardian_settings_v1` in `localStorage`; unlike optional session snapshots, propagate settings write errors so the shared store can rollback. Make the existing cue player consult the browser preference controller for every cue.

- [ ] **Step 3: Make event persistence clearable and serialized**

Add `clear()` to the browser event and quarantine stores. Serialize append/ack/clear operations through one per-key chain so an append started before clear cannot restore old records afterward.

- [ ] **Step 4: Write failing guardian-page interaction tests**

Render the page with injected settings/reset dependencies and assert section order, all four switches, 64px rows, `累计成长值`, unsupported music explanation, persistence after recreation, save rollback message, reset dialog cancellation, cancel-button initial focus, successful reset, and reset failure text.

- [ ] **Step 5: Implement the Playground guardian page**

Subscribe with `useSyncExternalStore`, render the shared ordered settings model, disable only unsupported controls, call `update` on change, and render a destructive `清除学习记录` button. The custom modal must use `role="dialog"`, `aria-modal="true"`, explain irreversibility, and focus `取消` on open.

- [ ] **Step 6: Run Playground focused tests**

```bash
./node_modules/.bin/vitest run apps/playground/test/GuardianPage.test.tsx apps/playground/test/cue-player.test.ts apps/playground/test/session-snapshot-storage.test.ts
```

Expected: PASS.

### Task 4: Taro Platform and Guardian Page

**Files:**
- Create: `frontend/apps/miniapp/src/guardian-settings.ts`
- Modify: `frontend/apps/miniapp/src/platform/types.ts`
- Modify: `frontend/apps/miniapp/src/platform/create-platform.ts`
- Modify: `frontend/apps/miniapp/__mocks__/taro.ts`
- Modify: `frontend/apps/playground/src/taro-shim/components.tsx`
- Modify: `frontend/apps/miniapp/src/pages/guardian/index.tsx`
- Modify: `frontend/apps/miniapp/src/pages/guardian/index.module.scss`
- Modify: `frontend/apps/miniapp/test/app.smoke.test.tsx`
- Modify: `frontend/apps/miniapp/test/GuardianPage.test.tsx`

**Interfaces:**
- Consumes: shared settings store and clear use case
- Produces: Taro settings repository, preference ports, serialized event clearing, and native switch UI

- [ ] **Step 1: Write failing Taro platform tests**

Prove settings persistence propagates `setStorageSync` failures, event/quarantine clear removes both current and legacy queues, clear waits behind an in-flight append, disabled cue preferences suppress audio/haptics independently, and eye protection invokes platform theme APIs.

- [ ] **Step 2: Implement the Taro adapters**

Add preference ports to `Platform`; keep background music unsupported, track answer-sound and haptic flags inside `createTaroPlatform`, and apply the warm low-brightness background/navigation colors through Taro APIs. Serialize queue mutation and clear operations with the existing keyed write-chain pattern.

- [ ] **Step 3: Write failing miniapp guardian-page tests**

Mirror the Playground assertions for shared order/copy, four switches, 64px rows, restored values, rollback message, confirmation cancellation, successful reset, and failed reset.

- [ ] **Step 4: Implement the miniapp guardian page**

Use Taro `Switch` controls and the same shared presentation model. Keep the current paper background and white panels, add the destructive data section and accessible confirmation dialog, and keep all command handling in injected/shared dependencies.

- [ ] **Step 5: Run miniapp focused tests**

```bash
./node_modules/.bin/vitest run apps/miniapp/test/app.smoke.test.tsx apps/miniapp/test/GuardianPage.test.tsx
```

Expected: PASS.

### Task 5: Shared Two-Second Parent Gate

**Files:**
- Modify: `frontend/apps/playground/src/components/ParentGate.tsx`
- Modify: `frontend/apps/playground/test/ParentGate.test.tsx`
- Modify: `frontend/apps/miniapp/src/components/ParentGate.tsx`
- Create: `frontend/apps/miniapp/test/ParentGate.test.tsx`
- Modify: `frontend/apps/miniapp/test/HomePage.test.tsx`

**Interfaces:**
- Consumes: `PARENT_GATE_HOLD_DURATION_MS`
- Produces: unchanged `ParentGate({ onUnlock })` contract with visible progress

- [ ] **Step 1: Change tests to the shared two-second contract**

Assert no unlock at `1_999ms`, one unlock at `2_000ms`, and progress increases while held. Cover pointer/touch release, pointer leave, touch cancel, and unmount cleanup; preserve the accessible name `长按进入家长中心`.

- [ ] **Step 2: Run both gate tests and verify RED**

```bash
./node_modules/.bin/vitest run apps/playground/test/ParentGate.test.tsx apps/miniapp/test/ParentGate.test.tsx apps/miniapp/test/HomePage.test.tsx
```

Expected: FAIL against the current 3-second implementations.

- [ ] **Step 3: Implement cancellable progress**

Use the shared duration constant, one timeout for unlock, and one short interval for ring progress. Clear both handles and reset progress on every cancel path and on unmount. Render a stable-size circular progress treatment without adding click-to-unlock.

- [ ] **Step 4: Rerun both gate tests**

Expected: PASS.

### Task 6: Regression, Coverage, and Plan Closure

**Files:**
- Modify only files implicated by failures from Tasks 1-5.
- Modify: `docs/superpowers/plans/2026-09-16-guardian-settings.md`

**Interfaces:**
- Consumes: all behavior above
- Produces: verified frontend workspace and completed plan status

- [ ] **Step 1: Run all guardian-focused tests**

```bash
./node_modules/.bin/vitest run packages/application/test/guardian.settings.test.ts packages/application/test/guardian.clear-learning-records.test.ts apps/playground/test/GuardianPage.test.tsx apps/playground/test/ParentGate.test.tsx apps/playground/test/cue-player.test.ts apps/miniapp/test/GuardianPage.test.tsx apps/miniapp/test/ParentGate.test.tsx apps/miniapp/test/HomePage.test.tsx apps/miniapp/test/app.smoke.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript project references**

```bash
./node_modules/.bin/tsc -b --pretty
```

Expected: PASS.

- [ ] **Step 3: Run the complete frontend suite**

```bash
./node_modules/.bin/vitest run --silent
```

Expected: PASS.

- [ ] **Step 4: Run complete coverage**

```bash
./node_modules/.bin/vitest run --coverage --silent
```

Expected: PASS with 100% statements, branches, functions, and lines for configured application/package coverage.

- [ ] **Step 5: Mark this plan completed**

Add `> **Status:** Completed and verified on 2026-09-16.` below the agentic-worker header only after all commands pass.
