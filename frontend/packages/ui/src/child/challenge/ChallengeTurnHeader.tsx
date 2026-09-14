import { Text, View } from "@tarojs/components";
import type { ChallengeMode, Participant } from "@cc/domain";
import { tokens } from "../../tokens";

export interface ChallengeTurnHeaderProps {
  participant: Participant;
  mode: ChallengeMode;
  remainingMs: number;
  current: number;
  total: number;
}

function formatCountdown(remainingMs: number): string {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

export function ChallengeTurnHeader({
  participant,
  mode,
  remainingMs,
  current,
  total,
}: ChallengeTurnHeaderProps) {
  const progress =
    mode === "TIMED"
      ? Math.min(Math.max(remainingMs / 60_000, 0), 1)
      : total > 0
        ? Math.min(Math.max(current / total, 0), 1)
        : 0;
  const isChild = participant === "CHILD";
  return (
    <View style={{ color: tokens.color.text }}>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.space[2],
        }}
      >
        {/* 回合选手胶囊：糖果色底 + emoji 头像点缀 */}
        <Text
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: `${tokens.space[1]}px ${tokens.space[3]}px`,
            borderRadius: tokens.radius.pill,
            background: isChild ? "#fdf1dd" : "#eef1f5",
            color: isChild ? tokens.color.currentStrong : "#42505f",
            fontSize: tokens.fontSize.sm,
            fontWeight: 800,
          }}
        >
          <Text aria-hidden="true">{isChild ? "🧒" : "🧑"}</Text>
          {isChild ? "小朋友加油" : "家长挑战"}
        </Text>
        <View style={{ display: "flex", alignItems: "center", gap: tokens.space[2] }}>
          {mode === "TIMED" ? (
            <Text
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: `${tokens.space[1]}px ${tokens.space[2]}px`,
                borderRadius: tokens.radius.pill,
                background: "#fff2e0",
                color: tokens.color.currentStrong,
                fontSize: tokens.fontSize.sm,
                fontWeight: 800,
              }}
            >
              <Text aria-hidden="true">⏱️</Text>
              {formatCountdown(remainingMs)}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: tokens.fontSize.sm,
              fontWeight: 800,
              color: tokens.color.textSoft,
            }}
          >
            {`${current} / ${total}`}
          </Text>
        </View>
      </View>
      <View
        style={{
          height: 8,
          marginTop: tokens.space[2],
          overflow: "hidden",
          borderRadius: tokens.radius.pill,
          background: "#ecdcbf",
        }}
      >
        <View
          data-challenge-progress="true"
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: tokens.radius.pill,
            background: tokens.gradient.questionProgress,
          }}
        />
      </View>
    </View>
  );
}
