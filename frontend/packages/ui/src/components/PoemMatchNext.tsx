import React from "react";
import type { ChoiceLikeProps } from "./choice-types";
import { ChoiceQuestion } from "./ChoiceQuestion";

/** 上下句连连看：给上句，四选一下句。复用单选交互，标注“上句”点题。 */
export function PoemMatchNext({
  question,
  disabled = false,
  onAnswer,
}: ChoiceLikeProps) {
  return (
    <ChoiceQuestion
      prompt={question.prompt}
      promptLabel="上句"
      options={question.options}
      disabled={disabled}
      onSelect={onAnswer}
    />
  );
}
