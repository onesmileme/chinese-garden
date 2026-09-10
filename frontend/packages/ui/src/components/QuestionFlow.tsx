import { useEffect, useRef, useState } from "react";
import { isCorrectAnswer, type GeneratedQuestion } from "@cc/domain";
import { View } from "@tarojs/components";
import {
  AnswerFeedback,
  CORRECT_FEEDBACK_MS,
} from "./AnswerFeedback";
import { QuestionGuide } from "./QuestionGuide";
import { QuestionView } from "./QuestionView";
import { tokens } from "../tokens";

export type QuestionCue = "correct" | "wrong";

export interface QuestionFlowProps {
  question: GeneratedQuestion;
  onQuestionReady?(question: GeneratedQuestion): void;
  onAnswerSelected?(chosenAnswer: string, correct: boolean): void;
  onAnswered(correct: boolean, chosenAnswer: string): Promise<void>;
  onCue(cue: QuestionCue): void;
  onBusyChange?(busy: boolean): void;
}

type FeedbackState =
  | { kind: "idle" }
  | { kind: "correct" }
  | { kind: "wrong"; chosenAnswer: string; saving: boolean };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function QuestionFlow({
  question,
  onQuestionReady,
  onAnswerSelected,
  onAnswered,
  onCue,
  onBusyChange,
}: QuestionFlowProps) {
  const submitting = useRef(false);
  const continuing = useRef(false);
  const busy = useRef(false);
  const attemptRef = useRef(0);
  const previousQuestion = useRef(question);
  const readyQuestionSeed = useRef<string>();
  const latestQuestion = useRef(question);
  const latestOnQuestionReady = useRef(onQuestionReady);
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: "idle" });
  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;
  latestQuestion.current = question;
  latestOnQuestionReady.current = onQuestionReady;

  function beginBusy(): void {
    busy.current = true;
    onBusyChange?.(true);
  }

  function endBusy(): void {
    if (!busy.current) return;
    busy.current = false;
    onBusyChange?.(false);
  }

  useEffect(() => {
    if (previousQuestion.current === question) return;

    previousQuestion.current = question;
    if (feedbackRef.current.kind === "correct") return;

    attemptRef.current += 1;
    submitting.current = false;
    continuing.current = false;
    setFeedback({ kind: "idle" });
    endBusy();
  }, [question]);

  useEffect(() => {
    if (
      feedback.kind !== "idle" ||
      readyQuestionSeed.current === question.seed ||
      latestOnQuestionReady.current === undefined
    ) {
      return;
    }

    readyQuestionSeed.current = question.seed;
    latestOnQuestionReady.current(latestQuestion.current);
  }, [feedback.kind, onQuestionReady, question.seed]);

  async function submit(chosenAnswer: string): Promise<void> {
    const correct = isCorrectAnswer(question, chosenAnswer);
    onAnswerSelected?.(chosenAnswer, correct);
    submitting.current = true;
    onCue(correct ? "correct" : "wrong");
    beginBusy();

    if (!correct) {
      attemptRef.current += 1;
      setFeedback({ kind: "wrong", chosenAnswer, saving: false });
      return;
    }

    setFeedback({ kind: "correct" });
    const [saved] = await Promise.allSettled([
      onAnswered(true, chosenAnswer),
      delay(CORRECT_FEEDBACK_MS),
    ]);

    setFeedback({ kind: "idle" });
    submitting.current = false;
    endBusy();
    if (saved.status === "rejected") return;
  }

  async function continueAfterWrong(chosenAnswer: string): Promise<void> {
    if (continuing.current) return;

    continuing.current = true;
    const attempt = attemptRef.current;
    setFeedback({ kind: "wrong", chosenAnswer, saving: true });
    try {
      await onAnswered(false, chosenAnswer);
      if (attemptRef.current !== attempt) return;

      setFeedback({ kind: "idle" });
      submitting.current = false;
      endBusy();
    } catch {
      if (attemptRef.current === attempt) {
        setFeedback({ kind: "wrong", chosenAnswer, saving: false });
      }
    } finally {
      if (attemptRef.current === attempt) {
        continuing.current = false;
      }
    }
  }

  const locked = feedback.kind !== "idle";

  return (
    <View>
      <QuestionGuide question={question} />
      <QuestionView
        question={question}
        disabled={locked}
        onAnswer={(chosenAnswer) => {
          void submit(chosenAnswer);
        }}
      />
      <View
        data-correct-feedback-slot="true"
        style={{
          minHeight: 48,
          marginTop: tokens.space[3],
        }}
      >
        {feedback.kind === "correct" ? (
          <AnswerFeedback status="correct" />
        ) : null}
      </View>
      {feedback.kind === "wrong" ? (
        <AnswerFeedback
          status="wrong"
          chosenAnswer={feedback.chosenAnswer}
          correctAnswer={question.correctAnswer}
          busy={feedback.saving}
          onContinue={() => {
            void continueAfterWrong(feedback.chosenAnswer);
          }}
        />
      ) : null}
    </View>
  );
}
