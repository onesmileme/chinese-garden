import { challengeCorpus } from "@cc/content";
import { describe, expect, it } from "vitest";
import { createLeveledDailyPlanInput, generateDailyPlan } from "../src";

describe("createLeveledDailyPlanInput", () => {
  it("rejects a corpus with no unlocked learning content", () => {
    expect(() =>
      createLeveledDailyPlanInput({
        corpus: { characters: [], poems: [], idioms: [] },
        abilityLevel: 1,
        remediation: false,
        due: [],
        weak: [],
        mastered: [],
        seed: "daily-empty",
      }),
    ).toThrow("no unlocked content for daily plan");
  });

  it("rejects unlocked content that cannot fill the poem challenge slot", () => {
    expect(() =>
      createLeveledDailyPlanInput({
        corpus: {
          poems: [],
          idioms: challengeCorpus.idioms.filter(({ level }) => level === 1),
        },
        abilityLevel: 1,
        remediation: false,
        due: [],
        weak: [],
        mastered: [],
        seed: "daily-no-poem",
      }),
    ).toThrow("no unlocked poem for daily plan challenge");
  });

  it("never admits knowledge points above the child ability level", () => {
    const input = createLeveledDailyPlanInput({
      corpus: challengeCorpus,
      abilityLevel: 2,
      remediation: false,
      due: challengeCorpus.characters.map(({ id }) => id),
      weak: challengeCorpus.poems.map(({ id }) => id),
      mastered: challengeCorpus.idioms.map(({ id }) => id),
      seed: "daily-1",
    });

    const eligible = new Set(
      [
        ...challengeCorpus.characters,
        ...challengeCorpus.poems,
        ...challengeCorpus.idioms,
      ]
        .filter((item) => item.status === "ACTIVE" && item.level <= 2)
        .map(({ id }) => id),
    );
    const planIds = generateDailyPlan(input)
      .flatMap(({ slots }) => slots)
      .map(({ kpId }) => kpId);

    expect(planIds.every((id) => eligible.has(id))).toBe(true);
  });

  it("uses lower-level content for all seven review slots during remediation", () => {
    const input = createLeveledDailyPlanInput({
      corpus: challengeCorpus,
      abilityLevel: 3,
      remediation: true,
      due: [],
      weak: [],
      mastered: [],
      seed: "daily-remediation",
    });
    const plan = generateDailyPlan(input);
    const reviewIds = [
      ...plan[0]!.slots,
      ...plan[2]!.slots.filter(({ role }) => role === "MIXED"),
    ].map(({ kpId }) => kpId);
    const levelById = new Map(
      [
        ...challengeCorpus.characters,
        ...challengeCorpus.poems,
        ...challengeCorpus.idioms,
      ].map(({ id, level }) => [id, level]),
    );

    expect(reviewIds).toHaveLength(7);
    expect(reviewIds.every((id) => levelById.get(id)! < 3)).toBe(true);
    expect(levelById.get(input.newKpId)).toBe(3);
  });

  it("keeps L1 remediation entirely at L1", () => {
    const input = createLeveledDailyPlanInput({
      corpus: challengeCorpus,
      abilityLevel: 1,
      remediation: true,
      due: [],
      weak: [],
      mastered: [],
      seed: "daily-l1",
    });
    const levelById = new Map(
      [
        ...challengeCorpus.characters,
        ...challengeCorpus.poems,
        ...challengeCorpus.idioms,
      ].map(({ id, level }) => [id, level]),
    );

    expect(
      generateDailyPlan(input)
        .flatMap(({ slots }) => slots)
        .every(({ kpId }) => levelById.get(kpId) === 1),
    ).toBe(true);
  });

  it("falls back to unlocked lower levels when the current level is empty", () => {
    const l1Corpus = {
      characters: challengeCorpus.characters.filter(({ level }) => level === 1),
      poems: challengeCorpus.poems.filter(({ level }) => level === 1),
      idioms: challengeCorpus.idioms.filter(({ level }) => level === 1),
    };
    const input = createLeveledDailyPlanInput({
      corpus: l1Corpus,
      abilityLevel: 2,
      remediation: false,
      due: [],
      weak: [],
      mastered: [],
      seed: "daily-lower-fallback",
    });
    const eligible = new Set(
      [...l1Corpus.characters, ...l1Corpus.poems].map(({ id }) => id),
    );

    expect(eligible.has(input.newKpId)).toBe(true);
    expect(input.recentWeakKpIds).toEqual([]);
  });
});
