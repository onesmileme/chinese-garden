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
  return (
    <View style={{ color: tokens.color.text }}>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.space[3],
        }}
      >
        <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>
          {participant === "CHILD" ? "小朋友加油" : "家长挑战"}
        </Text>
        <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>
          {mode === "TIMED" ? (
            <>
              <Text>{formatCountdown(remainingMs)}</Text>
              {" · "}
              <Text>{`${current} / ${total}`}</Text>
            </>
          ) : (
            `${current} / ${total}`
          )}
        </Text>
      </View>
      <View
        style={{
          height: 12,
          marginTop: tokens.space[2],
          overflow: "hidden",
          borderRadius: tokens.radius.md,
          background: tokens.color.locked,
        }}
      >
        <View
          data-challenge-progress="true"
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: tokens.radius.md,
            background: tokens.color.current,
          }}
        />
      </View>
    </View>
  );
}
