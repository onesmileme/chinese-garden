import React from "react";
import type { ChoiceLikeProps } from "./choice-types";
import { ChoiceQuestion } from "./ChoiceQuestion";

/** 成语释义辨析：给成语，四选一释义。复用单选交互，标注“成语”点题。 */
export function IdiomMeaning({
  question,
  disabled = false,
  onAnswer,
}: ChoiceLikeProps) {
  return (
    <ChoiceQuestion
      prompt={question.prompt}
      promptLabel="成语"
      options={question.options}
      disabled={disabled}
      onSelect={onAnswer}
    />
  );
}
