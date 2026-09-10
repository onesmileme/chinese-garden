import type { QuestionType } from "@cc/content-schema";

export interface PickQuestionTypeInput {
  role: string;
  kind: "POEM" | "IDIOM";
  seed: string;
}

const POEM_TYPES: QuestionType[] = ["POEM_FILL", "POEM_MATCH_NEXT"];
const IDIOM_TYPES: QuestionType[] = ["IDIOM_CHAIN", "IDIOM_MEANING"];

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickQuestionType(input: PickQuestionTypeInput): QuestionType {
  if (input.role === "CHALLENGE") return "POEM_FILL";
  const pool = input.kind === "POEM" ? POEM_TYPES : IDIOM_TYPES;
  return pool[hash(`${input.role}:${input.kind}:${input.seed}`) % pool.length]!;
}
