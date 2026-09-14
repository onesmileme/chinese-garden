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
          borderRadius: `${tokens.radius.xl}px ${tokens.radius.xl}px 0 0`,
          background: tokens.question.stage,
          boxShadow: "0 -10px 30px rgba(78, 54, 24, 0.16)",
          pointerEvents: "auto",
        }}
      >
        {/* 顶部抓手条：底部弹层的糖果风指示 */}
        <View
          aria-hidden="true"
          style={{
            width: 44,
            height: 4,
            margin: `0 auto ${tokens.space[3]}px`,
            borderRadius: tokens.radius.pill,
            background: tokens.color.locked,
          }}
        />

        {/* 暖心教练区：吉祥物图标 + 鼓励标题 + 副标题 */}
        <View
          style={{
            display: "flex",
            alignItems: "center",
            gap: tokens.space[3],
          }}
        >
          <Text
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: tokens.radius.md + 4,
              background: tokens.gradient.warmIcon,
              fontSize: 24,
            }}
          >
            🌱
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
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
                marginTop: 2,
                color: tokens.color.textSoft,
                fontSize: 12,
              }}
            >
              差一点点就对啦，认真看看正确答案就记住啦
            </Text>
          </View>
        </View>

        {/* 对比卡：你的选择（红）与正确答案（绿）分区高亮 */}
        <View
          style={{
            marginTop: tokens.space[4],
            padding: tokens.space[3],
            borderRadius: tokens.radius.card,
            background: tokens.bg.surface,
            border: "1px solid #efe6d0",
            boxShadow: tokens.shadow.card,
          }}
        >
          <View
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.space[2],
              padding: tokens.space[2],
              borderRadius: tokens.radius.md + 4,
              background: "#fdeef0",
              border: "1px solid #f6d5da",
            }}
          >
            <Text
              aria-hidden="true"
              style={{
                flexShrink: 0,
                padding: `2px ${tokens.space[2]}px`,
                borderRadius: tokens.radius.pill,
                background: tokens.color.wrong,
                color: tokens.bg.surface,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              你的选择
            </Text>
            <Text
              style={{
                flex: 1,
                color: tokens.color.wrong,
                fontSize: tokens.fontSize.sm,
                fontWeight: 700,
                overflowWrap: "anywhere",
              }}
            >
              你选的是：{props.chosenAnswer}
            </Text>
          </View>
          <View
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.space[2],
              marginTop: tokens.space[2],
              padding: tokens.space[2],
              borderRadius: tokens.radius.md + 4,
              background: "#eaf7f0",
              border: "1px solid #cdebdc",
            }}
          >
            <Text
              aria-hidden="true"
              style={{
                flexShrink: 0,
                padding: `2px ${tokens.space[2]}px`,
                borderRadius: tokens.radius.pill,
                background: tokens.color.correct,
                color: tokens.bg.surface,
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              正确答案
            </Text>
            <Text
              style={{
                flex: 1,
                color: tokens.color.correct,
                fontSize: tokens.fontSize.sm,
                fontWeight: 800,
                overflowWrap: "anywhere",
              }}
            >
              正确答案：{props.correctAnswer}
            </Text>
          </View>
        </View>

        {/* 鼓励贴士：诗意百宝箱风格的暖色提示卡 */}
        <View
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: tokens.space[2],
            marginTop: tokens.space[3],
            padding: tokens.space[3],
            borderRadius: tokens.radius.card,
            background: "#fff7ea",
            border: "1px solid #f4e2be",
          }}
        >
          <Text aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>
            💡
          </Text>
          <Text
            style={{
              flex: 1,
              color: tokens.color.text,
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <Text style={{ fontWeight: 800, color: tokens.color.currentStrong }}>
              记一记：
            </Text>
            把正确答案在心里默念两遍，想想它藏在哪一句里，下一题一定更棒！
          </Text>
        </View>

        <Button
          aria-label={props.busy ? "正在保存" : "我记住啦"}
          disabled={props.busy}
          onClick={props.onContinue}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            boxSizing: "border-box",
            width: "100%",
            minHeight: tokens.control.optionMinHeight,
            marginTop: tokens.space[4],
            border: "none",
            borderRadius: tokens.radius.xl,
            background: props.busy ? "#e6d9bd" : tokens.gradient.cta,
            boxShadow: props.busy ? "none" : tokens.shadow.kidBtn,
            color: props.busy ? tokens.color.textSoft : tokens.bg.surface,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          {props.busy ? "正在保存" : "我记住啦，下一题"}
          {props.busy ? null : (
            <Text aria-hidden="true" style={{ marginLeft: 2 }}>
              →
            </Text>
          )}
        </Button>
      </View>
    </View>
  );
}
