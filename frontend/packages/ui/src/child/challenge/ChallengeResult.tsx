import { Button, Text, View } from "@tarojs/components";
import type { ChallengeResultDetails, ChallengeWinner } from "@cc/domain";
import { tokens } from "../../tokens";

export interface ChallengeResultProps {
  details: ChallengeResultDetails;
  onReplay(): void;
  onExit(): void;
}

const WINNER_HEADLINE: Record<ChallengeWinner, string> = {
  CHILD: "小朋友赢啦！",
  PARENT: "家长赢得这一局",
  DRAW: "并列冠军",
};

function resultValue(
  details: ChallengeResultDetails,
  side: "child" | "parent",
): string {
  const result = details[side];
  return details.mode === "TIMED"
    ? `${result.correctCount} 题`
    : `${result.correctCount} 题 · ${(result.activeElapsedMs / 1_000).toFixed(
        1,
      )} 秒`;
}

export function ChallengeResult({
  details,
  onReplay,
  onExit,
}: ChallengeResultProps) {
  return (
    <View style={{ textAlign: "center", color: tokens.color.text }}>
      <Text
        style={{
          display: "block",
          fontSize: tokens.fontSize.lg,
          fontWeight: 800,
        }}
      >
        {WINNER_HEADLINE[details.winner]}
      </Text>
      <View
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: tokens.space[3],
          marginTop: tokens.space[4],
        }}
      >
        <View
          style={{
            padding: tokens.space[4],
            borderRadius: tokens.radius.md,
            background: tokens.bg.surface,
          }}
        >
          <Text style={{ display: "block", fontWeight: 800 }}>小朋友</Text>
          <Text style={{ display: "block", marginTop: tokens.space[2] }}>
            {resultValue(details, "child")}
          </Text>
        </View>
        <View
          style={{
            padding: tokens.space[4],
            borderRadius: tokens.radius.md,
            background: tokens.bg.surface,
          }}
        >
          <Text style={{ display: "block", fontWeight: 800 }}>家长</Text>
          <Text style={{ display: "block", marginTop: tokens.space[2] }}>
            {resultValue(details, "parent")}
          </Text>
        </View>
      </View>
      <Button
        onClick={onReplay}
        style={{
          width: "100%",
          minHeight: 64,
          margin: `${tokens.space[4]}px 0 0`,
          border: 0,
          borderRadius: tokens.radius.md,
          background: tokens.color.current,
          color: tokens.color.text,
          fontWeight: 800,
        }}
      >
        再来一局
      </Button>
      <Button
        onClick={onExit}
        style={{
          width: "100%",
          minHeight: 64,
          margin: `${tokens.space[2]}px 0 0`,
          border: 0,
          background: "transparent",
          color: tokens.color.text,
        }}
      >
        回到学习路线
      </Button>
    </View>
  );
}
