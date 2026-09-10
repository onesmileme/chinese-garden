import { describe, expect, it } from "vitest";
import type { QuestionType } from "@cc/content-schema";
import {
  buildKnowledgeWorldModel,
  worldForQuestionType,
  type KnowledgeWorld,
  type WorldQuestion,
} from "../src";

describe("worldForQuestionType", () => {
  it("maps all four question types to their knowledge worlds", () => {
    const expected: Record<QuestionType, KnowledgeWorld> = {
      POEM_FILL: "poem",
      POEM_MATCH_NEXT: "poem",
      IDIOM_CHAIN: "idiom",
      IDIOM_MEANING: "idiom",
    };

    for (const type of Object.keys(expected) as QuestionType[]) {
      expect(worldForQuestionType(type)).toBe(expected[type]);
    }
  });

  it("rejects an unsupported runtime question type", () => {
    expect(() => worldForQuestionType("UNKNOWN" as QuestionType)).toThrow(
      "unsupported question type: UNKNOWN",
    );
  });
});

const step = (questionType: QuestionType): WorldQuestion => ({
  question: { questionType },
});

describe("buildKnowledgeWorldModel", () => {
  const steps = [
    step("POEM_FILL"),
    step("POEM_MATCH_NEXT"),
    step("IDIOM_CHAIN"),
    step("IDIOM_MEANING"),
    step("POEM_FILL"),
  ];

  it("counts all questions and completed questions from the leading prefix", () => {
    expect(buildKnowledgeWorldModel(steps, 3)).toEqual([
      { id: "poem", title: "诗词", total: 3, completed: 2 },
      { id: "idiom", title: "成语", total: 2, completed: 1 },
    ]);
  });

  it("clamps completed count to the available question range", () => {
    expect(
      buildKnowledgeWorldModel(steps, -1).map((world) => world.completed),
    ).toEqual([0, 0]);
    expect(
      buildKnowledgeWorldModel(steps, 16).map((world) => world.completed),
    ).toEqual([3, 2]);
  });
});
