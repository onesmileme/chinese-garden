import { useRef, useState } from "react";
import { isCorrectAnswer, type GeneratedQuestion } from "@cc/domain";
import { Button, Text, View } from "@tarojs/components";
import { AnswerFeedback } from "../../components/AnswerFeedback";
import { QuestionGuide } from "../../components/QuestionGuide";
import { QuestionView } from "../../components/QuestionView";

export interface ChallengeQuestionProps {
  question: GeneratedQuestion;
  /** 已保存的错误答案（中断恢复时用于直接展示反馈）。 */
  initialWrongAnswer?: string;
  /** 答对时推进回合；确认错误反馈后以 correct=false 推进。 */
  onAnswered(
    correct: boolean,
    chosenAnswer: string,
  ): void | Promise<void>;
  /** 错误答案在展示反馈前先落盘，供中断恢复。 */
  onWrongSubmitted(chosenAnswer: string): void | Promise<void>;
}

type PendingAction =
  | { kind: "ANSWER"; correct: boolean; answer: string }
  | { kind: "WRONG_SUBMISSION"; answer: string };

// 挑战回合的作答壳：复用题型渲染，把「答对推进 / 答错落盘并展示反馈 / 确认后推进」
// 的交互对齐引擎的 submitChallengeAnswer + confirmWrongFeedback 两步语义。
export function ChallengeQuestion({
  question,
  initialWrongAnswer,
  onAnswered,
  onWrongSubmitted,
}: ChallengeQuestionProps) {
  const [feedback, setFeedback] = useState<string | null>(
    initialWrongAnswer ?? null,
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const persist = async (action: PendingAction): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(action);
    setBusy(true);
    setFailed(false);
    try {
      if (action.kind === "WRONG_SUBMISSION") {
        await onWrongSubmitted(action.answer);
        setFeedback(action.answer);
      } else {
        await onAnswered(action.correct, action.answer);
        if (!action.correct) setFeedback(null);
      }
      setPending(null);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const submit = (chosenAnswer: string): void => {
    /* v8 ignore next -- QuestionView disables answers while pending or showing feedback. */
    if (pending || feedback !== null) return;
    const correct = isCorrectAnswer(question, chosenAnswer);
    void persist(
      correct
        ? { kind: "ANSWER", correct: true, answer: chosenAnswer }
        : { kind: "WRONG_SUBMISSION", answer: chosenAnswer },
    );
  };

  const next = (chosenAnswer: string): void => {
    /* v8 ignore next -- AnswerFeedback disables continue while persistence is pending. */
    if (pending) return;
    void persist({ kind: "ANSWER", correct: false, answer: chosenAnswer });
  };

  return (
    <View>
      <QuestionGuide question={question} />
      <QuestionView
        question={question}
        disabled={feedback !== null || pending !== null}
        onAnswer={submit}
      />
      {failed && pending ? (
        <View role="alert">
          <Text>保存失败，请重试</Text>
          <Button disabled={busy} onClick={() => void persist(pending)}>
            重试保存
          </Button>
        </View>
      ) : null}
      {feedback !== null ? (
        <AnswerFeedback
          status="wrong"
          chosenAnswer={feedback}
          correctAnswer={question.correctAnswer}
          busy={busy}
          onContinue={() => next(feedback)}
        />
      ) : null}
    </View>
  );
}
