import React from "react";
import type { GeneratedQuestion } from "@cc/domain";
import { PoemFill } from "./PoemFill";
import { PoemMatchNext } from "./PoemMatchNext";
import { IdiomChain } from "./IdiomChain";
import { IdiomMeaning } from "./IdiomMeaning";

export interface QuestionViewProps {
  question: GeneratedQuestion;
  disabled?: boolean;
  onAnswer(chosenAnswer: string): void;
}

function assertNever(value: never): never {
  throw new Error(`unsupported question type: ${String(value)}`);
}

export function QuestionView({
  question,
  disabled = false,
  onAnswer,
}: QuestionViewProps) {
  switch (question.questionType) {
    case "POEM_FILL":
      return (
        <PoemFill
          question={question}
          disabled={disabled}
          onAnswer={onAnswer}
        />
      );
    case "POEM_MATCH_NEXT":
      return (
        <PoemMatchNext
          question={question}
          disabled={disabled}
          onAnswer={onAnswer}
        />
      );
    case "IDIOM_CHAIN":
      return (
        <IdiomChain
          question={question}
          disabled={disabled}
          onAnswer={onAnswer}
        />
      );
    case "IDIOM_MEANING":
      return (
        <IdiomMeaning
          question={question}
          disabled={disabled}
          onAnswer={onAnswer}
        />
      );
  }
  return assertNever(question.questionType);
}
