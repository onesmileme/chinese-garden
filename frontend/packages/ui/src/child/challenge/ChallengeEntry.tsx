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
        padding: tokens.space[4],
        borderRadius: tokens.radius.md,
        background: tokens.bg.surface,
        color: tokens.color.text,
      }}
    >
      <Text
        style={{
          display: "block",
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        亲子趣味挑战
      </Text>
      <Text style={{ display: "block", marginTop: tokens.space[2] }}>
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
          minHeight: 64,
          margin: `${tokens.space[4]}px 0 0`,
          border: 0,
          borderRadius: tokens.radius.md,
          background: disabled ? tokens.color.locked : tokens.color.current,
          color: tokens.color.text,
          fontWeight: 800,
        }}
      >
        {ACTION_LABEL[status]}
      </Button>
    </View>
  );
}
