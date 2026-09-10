import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeMastery } from "../src/mastery/engine";
import { initAssessment, applyCheckpoint } from "../src/assessment/reducer";
import { settleXpEvents } from "../src/progression/engine";
import { generateQuestion, type Corpus } from "../src/questions/generate";
import { canAssemble } from "../src/questions/idiom-chain";
import { validateCorpus } from "../src/questions/validate";
import { masteryRulesSchema, progressionRulesSchema } from "@cc/content-schema";

// content/ 位于 workspace 根（frontend/content/），相对本测试文件为 ../../../content。
const contentDir = fileURLToPath(new URL("../../../content/", import.meta.url));
const load = (rel: string) =>
  JSON.parse(readFileSync(contentDir + rel, "utf8"));

describe("rule version files parse against their schema", () => {
  it("mastery-v1 is valid", () => {
    expect(
      masteryRulesSchema.parse(load("rules/mastery-v1.json")).ruleVersion,
    ).toBe("mastery-v1");
  });
  it("progression-v1 is valid", () => {
    expect(
      progressionRulesSchema.parse(load("rules/progression-v1.json"))
        .ruleVersion,
    ).toBe("progression-v1");
  });
});

describe("mastery golden vectors", () => {
  const { cases } = load("test-vectors/mastery.json");
  it.each(cases)("$name", ({ input, expected }) => {
    expect(computeMastery(input)).toEqual(expected);
  });
});

describe("assessment golden vectors", () => {
  const { cases } = load("test-vectors/assessment.json");
  it.each(cases)("$name", ({ startLevelIndex, checkpoints, expected }) => {
    let s = initAssessment(startLevelIndex);
    for (const cp of checkpoints) s = applyCheckpoint(s, cp);
    expect(s.finished).toBe(expected.finished);
    expect(s.resultLevelIndex).toBe(expected.resultLevelIndex);
  });
});

describe("progression golden vectors", () => {
  const { cases } = load("test-vectors/progression.json");
  it.each(cases)("$name", ({ initial, events, expected }) => {
    expect(settleXpEvents(initial, events)).toEqual(expected);
  });
});

describe("question generation golden vectors", () => {
  const characterBank = load("corpus/character-bank.json");
  const poemBank = load("corpus/poem-bank.json");
  const idiomBank = load("corpus/idiom-bank.json");
  const corpus: Corpus = {
    characters: characterBank.characters,
    poems: poemBank.poems,
    idioms: idiomBank.idioms,
  };
  const questionsVector = load("test-vectors/questions.json");
  const { cases } = questionsVector;
  it("keeps the published corpus semantically valid", () => {
    expect(validateCorpus(corpus)).toEqual([]);
  });
  it("ships corpus-v5 with complete leveled metadata", () => {
    expect(characterBank.version).toBe("corpus-v5");
    expect(poemBank.version).toBe("corpus-v5");
    expect(idiomBank.version).toBe("corpus-v5");
    expect(questionsVector.contentVersion).toBe("corpus-v5");
    expect(corpus.characters.length).toBeGreaterThan(0);
    expect(corpus.poems.length).toBeGreaterThan(0);
    expect(corpus.idioms.length).toBeGreaterThan(0);
    for (const item of [
      ...corpus.characters,
      ...corpus.poems,
      ...corpus.idioms,
    ]) {
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(5);
      expect(item.difficulty).toBeGreaterThanOrEqual(1);
      expect(item.difficulty).toBeLessThanOrEqual(5);
      expect(item.promotionRequired).toBe(true);
      expect(item.status).toBe("ACTIVE");
      expect(item.tags).toEqual([]);
      expect(item.revision).toBe(1);
    }
    expect(
      [...corpus.poems, ...corpus.idioms].some(
        (item) => item.level !== item.difficulty,
      ),
    ).toBe(true);
  });
  it.each(cases)("$name", (c: any) => {
    const q = generateQuestion(
      c.questionType,
      c.knowledgePointId,
      corpus,
      c.seed,
    );
    if (c.expected.prompt !== undefined)
      expect(q.prompt).toBe(c.expected.prompt);
    if (c.expected.correctAnswer !== undefined)
      expect(q.correctAnswer).toBe(c.expected.correctAnswer);
    if (c.expected.optionsSorted !== undefined)
      expect([...q.options].sort()).toEqual(
        [...c.expected.optionsSorted].sort(),
      );
    if (c.expected.poemFill) {
      // POEM_FILL：结构化题面，correctAnswer 为按空序序列化串，非选项之一。
      const poem = corpus.poems.find((p) => p.id === c.knowledgePointId)!;
      const allChars = poem.lines.join("");
      expect(q.blanks!.length).toBeGreaterThan(0);
      for (const b of q.blanks!) {
        expect(allChars).toContain(b.answer);
        expect(q.candidates).toContain(b.answer);
      }
      expect(q.correctAnswer).toBe(
        q
          .blanks!.map((b) => `${b.index}=${b.answer}`)
          .join("|"),
      );
    }
    if (c.questionType === "IDIOM_CHAIN") {
      const source = corpus.idioms.find(
        (idiom) => idiom.id === c.knowledgePointId,
      )!;
      const successor = corpus.idioms.find(
        (idiom) => idiom.text === q.correctAnswer,
      )!;
      expect(q.options).toHaveLength(c.expected.candidateCount);
      expect(q.acceptedAnswers).toContain(q.correctAnswer);
      expect(c.expected.correctAnswerIsSuccessor).toBe(true);
      expect(source.tailPinyin).toBe(successor.headPinyin);
      expect(canAssemble(q.correctAnswer, q.options)).toBe(true);
    }
    // 正确答案始终在选项中（POEM_FILL 例外：correctAnswer 是序列化串；
    // IDIOM_CHAIN 由上方 canAssemble 校验）。
    if (c.questionType !== "POEM_FILL" && c.questionType !== "IDIOM_CHAIN")
      expect(q.options).toContain(q.correctAnswer);
  });
});
