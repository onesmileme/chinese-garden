import type { GeneratedQuestion } from "@cc/domain";

/** 单选类题型（POEM_MATCH_NEXT / IDIOM_MEANING 等）复用的受控属性。 */
export interface ChoiceLikeProps {
  question: GeneratedQuestion;
  disabled?: boolean;
  onAnswer(chosenAnswer: string): void;
}
