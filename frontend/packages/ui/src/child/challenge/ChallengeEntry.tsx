import { Button, Text, View } from "@tarojs/components";
import type { ChallengeWinner } from "@cc/domain";
import { tokens } from "../../tokens";

export interface ChallengeEntryProps {
  status: "LOCKED" | "READY" | "ACTIVE" | "UNAVAILABLE";
  lastWinner?: ChallengeWinner;
  onAction(): void;
}

const ACTION_LABEL = {
  LOCKED: "完成能力探索后解锁",
  READY: "发起挑战",
  ACTIVE: "继续亲子挑战",
  UNAVAILABLE: "今天的挑战题还没准备好",
} as const;

const WINNER_LABEL: Record<ChallengeWinner, string> = {
  CHILD: "上局：小朋友获胜",
  PARENT: "上局：家长获胜",
  DRAW: "上局：平局",
};

export function ChallengeEntry({
  status,
  lastWinner,
  onAction,
}: ChallengeEntryProps) {
  const disabled = status === "LOCKED" || status === "UNAVAILABLE";
  return (
    <View
      style={{
        padding: tokens.space[5],
        border: "1px solid rgba(234, 169, 60, 0.14)",
        borderRadius: tokens.radius.xl,
        background: tokens.bg.surface,
        boxShadow: tokens.shadow.card,
        color: tokens.color.text,
      }}
    >
      <View
        style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}
      >
        <Text aria-hidden="true" style={{ fontSize: 20 }}>
          👨‍👩‍👧‍👦
        </Text>
        <Text
          style={{
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
          }}
        >
          亲子趣味挑战
        </Text>
      </View>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[2],
          color: tokens.color.textSoft,
          fontSize: tokens.fontSize.sm,
          lineHeight: 1.6,
        }}
      >
        同一台设备轮流答题，看看今天谁更快更准
      </Text>
      {lastWinner ? (
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[2],
            color: tokens.color.currentStrong,
            fontWeight: 700,
          }}
        >
          {WINNER_LABEL[lastWinner]}
        </Text>
      ) : null}
      <Button
        disabled={disabled}
        onClick={onAction}
        style={{
          width: "100%",
          minHeight: 56,
          margin: `${tokens.space[4]}px 0 0`,
          border: disabled ? "1px solid #d3dfda" : "none",
          borderRadius: tokens.radius.md + 4,
          background: disabled ? "#e2ebe7" : tokens.gradient.cta,
          boxShadow: disabled ? "none" : tokens.shadow.kidBtn,
          color: disabled ? tokens.color.textSoft : tokens.bg.surface,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        {ACTION_LABEL[status]}
      </Button>
    </View>
  );
}
