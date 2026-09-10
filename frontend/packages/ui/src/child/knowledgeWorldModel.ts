import type { QuestionType } from "@cc/content-schema";

export type KnowledgeWorld = "poem" | "idiom";

export interface WorldQuestion {
  readonly question: {
    readonly questionType: QuestionType;
  };
}

export interface KnowledgeWorldVM {
  id: KnowledgeWorld;
  title: string;
  total: number;
  completed: number;
}

const WORLD_META: readonly Pick<KnowledgeWorldVM, "id" | "title">[] = [
  { id: "poem", title: "诗词" },
  { id: "idiom", title: "成语" },
];

function assertNever(value: never): never {
  throw new Error(`unsupported question type: ${String(value)}`);
}

export function worldForQuestionType(type: QuestionType): KnowledgeWorld {
  switch (type) {
    case "POEM_FILL":
    case "POEM_MATCH_NEXT":
      return "poem";
    case "IDIOM_CHAIN":
    case "IDIOM_MEANING":
      return "idiom";
  }
  return assertNever(type);
}

export function buildKnowledgeWorldModel(
  steps: readonly WorldQuestion[],
  completedCount: number,
): KnowledgeWorldVM[] {
  const completed = Math.min(Math.max(completedCount, 0), steps.length);
  const completedSteps = steps.slice(0, completed);

  return WORLD_META.map(({ id, title }) => ({
    id,
    title,
    total: steps.filter(
      (step) => worldForQuestionType(step.question.questionType) === id,
    ).length,
    completed: completedSteps.filter(
      (step) => worldForQuestionType(step.question.questionType) === id,
    ).length,
  }));
}
