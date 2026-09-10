import type { ReactNode } from "react";
import { View } from "@tarojs/components";
import { tokens } from "../tokens";

export function QuestionStage({ children }: { children: ReactNode }) {
  return (
    <View
      aria-label="答题区"
      data-question-stage="true"
      style={{
        boxSizing: "border-box",
        width: "100%",
        marginTop: tokens.space[4],
        padding: tokens.space[4],
        border: `2px solid ${tokens.question.stageBorder}`,
        borderRadius: tokens.radius.md,
        background: tokens.question.stage,
        boxShadow: `0 5px 0 ${tokens.question.stageShadow}`,
      }}
    >
      {children}
    </View>
  );
}
