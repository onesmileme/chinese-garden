import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";

export const CORRECT_FEEDBACK_MS = 600;

export type AnswerFeedbackProps =
  | { status: "correct" }
  | {
      status: "wrong";
      chosenAnswer: string;
      correctAnswer: string;
      busy: boolean;
      onContinue(): void;
    };

export function AnswerFeedback(props: AnswerFeedbackProps) {
  if (props.status === "correct") {
    return (
      <View
        role="status"
        aria-live="polite"
        style={{
          minHeight: 48,
          textAlign: "center",
          color: tokens.color.correct,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        ★ 答对啦
      </View>
    );
  }

  return (
    <View
      data-answer-feedback-overlay="true"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <View
        role="dialog"
        aria-labelledby="wrong-answer-title"
        style={{
          boxSizing: "border-box",
          width: "calc(100% - 32px)",
          maxWidth: 448,
          maxHeight: "100%",
          overflowY: "auto",
          padding: `${tokens.space[4]}px`,
          paddingBottom: `calc(${tokens.space[4]}px + env(safe-area-inset-bottom))`,
          border: `2px solid ${tokens.question.stageBorder}`,
          borderRadius: `${tokens.radius.md}px ${tokens.radius.md}px 0 0`,
          background: tokens.question.stage,
          boxShadow: "0 -8px 24px rgba(34, 49, 43, 0.14)",
          pointerEvents: "auto",
        }}
      >
        <Text
          id="wrong-answer-title"
          style={{
            display: "block",
            color: tokens.color.text,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
          }}
        >
          再看一看
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[3],
            color: tokens.color.wrong,
          }}
        >
          你选的是：{props.chosenAnswer}
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[2],
            color: tokens.color.correct,
          }}
        >
          正确答案：{props.correctAnswer}
        </Text>
        <Button
          disabled={props.busy}
          onClick={props.onContinue}
          style={{
            boxSizing: "border-box",
            width: "100%",
            minHeight: tokens.control.optionMinHeight,
            marginTop: tokens.space[4],
          }}
        >
          {props.busy ? "正在保存" : "我记住啦"}
        </Button>
      </View>
    </View>
  );
}
