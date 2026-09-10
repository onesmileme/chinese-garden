import type { GeneratedQuestion } from "@cc/domain";
import { Text, View } from "@tarojs/components";
import { mascotVM } from "../child/mascotModel";
import { tokens } from "../tokens";

type GuideQuestion = Pick<GeneratedQuestion, "questionType" | "prompt">;

function assertNever(value: never): never {
  throw new Error(`unsupported question type: ${String(value)}`);
}

export function questionGuideText(question: GuideQuestion): string {
  switch (question.questionType) {
    case "POEM_FILL":
      return "把合适的字送回诗句里吧";
    case "POEM_MATCH_NEXT":
      return "读上句，选出紧接着的下一句";
    case "IDIOM_CHAIN":
      return "接住最后一个字，续出新成语";
    case "IDIOM_MEANING":
      return "想一想，这个成语是什么意思？";
  }
  return assertNever(question.questionType);
}

export function QuestionGuide({ question }: { question: GuideQuestion }) {
  return (
    <View
      aria-label="题目提示"
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.space[2],
        marginBottom: tokens.space[3],
      }}
    >
      <Text
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          border: `2px solid ${tokens.question.stageBorder}`,
          borderRadius: "50%",
          background: tokens.bg.surface,
          fontSize: tokens.fontSize.lg,
        }}
      >
        {mascotVM("idle").emoji}
      </Text>
      <Text
        style={{
          color: tokens.color.text,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        {questionGuideText(question)}
      </Text>
    </View>
  );
}
