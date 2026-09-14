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

// 结算氛围：奖杯标题 + 温暖鼓励语，随胜负切换。
const WINNER_CHEER: Record<ChallengeWinner, string> = {
  CHILD: "小状元反应超快，家长也要加把劲啦！",
  PARENT: "爸爸妈妈答得飞快，宝贝专注力超级棒，就差一点点反超！",
  DRAW: "势均力敌，你们真是最默契的黄金搭档！",
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

const CHILD_ACCENT = tokens.color.emerald;
const PARENT_ACCENT = tokens.color.currentStrong;

function PlayerCard({
  role,
  icon,
  accent,
  avatarBg,
  isWinner,
  score,
  answered,
}: {
  role: string;
  icon: string;
  accent: string;
  avatarBg: string;
  isWinner: boolean;
  score: string;
  answered: number;
}) {
  return (
    <View
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: tokens.space[2],
        padding: tokens.space[4],
        borderRadius: tokens.radius.xl,
        background: isWinner ? "#fffaf0" : tokens.bg.surface,
        border: isWinner
          ? `2px solid ${tokens.color.current}`
          : "1px solid #efe6d0",
        boxShadow: isWinner ? tokens.shadow.kidBtn : tokens.shadow.card,
        overflow: "hidden",
      }}
    >
      {isWinner ? (
        <Text
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            padding: `2px ${tokens.space[2]}px`,
            borderBottomLeftRadius: tokens.radius.md + 4,
            background: tokens.gradient.cta,
            color: tokens.bg.surface,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          👑 胜出
        </Text>
      ) : null}
      <Text
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: tokens.radius.pill,
          background: avatarBg,
          border: `2px solid ${tokens.bg.surface}`,
          fontSize: 30,
        }}
      >
        {icon}
      </Text>
      <Text style={{ fontSize: tokens.fontSize.md, fontWeight: 800 }}>{role}</Text>
      <View
        style={{
          width: "100%",
          padding: `${tokens.space[2]}px`,
          borderRadius: tokens.radius.card,
          background: isWinner ? "#fdf1dd" : "#f7f4ee",
          textAlign: "center",
        }}
      >
        <Text
          style={{
            display: "block",
            color: tokens.color.textSoft,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          答对成绩
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: 2,
            color: accent,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
          }}
        >
          {score}
        </Text>
      </View>
      <Text style={{ color: tokens.color.textSoft, fontSize: 11 }}>
        {`共作答 ${answered} 题`}
      </Text>
    </View>
  );
}

export function ChallengeResult({
  details,
  onReplay,
  onExit,
}: ChallengeResultProps) {
  const childWins = details.winner === "CHILD";
  const parentWins = details.winner === "PARENT";
  return (
    <View style={{ color: tokens.color.text }}>
      {/* 颁奖标题：奖杯徽章 + 胜负文案 + 暖心鼓励 */}
      <View style={{ textAlign: "center" }}>
        <Text
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: tokens.radius.pill,
            background: tokens.gradient.warmIcon,
            boxShadow: tokens.shadow.card,
            fontSize: 32,
          }}
        >
          🏆
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[3],
            fontSize: tokens.fontSize.lg,
            fontWeight: 800,
          }}
        >
          {WINNER_HEADLINE[details.winner]}
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[2],
            color: tokens.color.textSoft,
            fontSize: tokens.fontSize.sm,
            lineHeight: 1.6,
          }}
        >
          {WINNER_CHEER[details.winner]}
        </Text>
      </View>

      {/* PK 对战双卡：中间 VS 标记，胜方高亮 */}
      <View style={{ position: "relative", marginTop: tokens.space[5] }}>
        <View
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: tokens.space[3],
            alignItems: "stretch",
          }}
        >
          <PlayerCard
            role="小朋友"
            icon="🧒"
            accent={CHILD_ACCENT}
            avatarBg="linear-gradient(180deg, #d6f5e6, #b6ead2)"
            isWinner={childWins}
            score={resultValue(details, "child")}
            answered={details.child.answeredCount}
          />
          <PlayerCard
            role="家长"
            icon="🧑"
            accent={PARENT_ACCENT}
            avatarBg="linear-gradient(180deg, #ffe4c4, #fcd3a1)"
            isWinner={parentWins}
            score={resultValue(details, "parent")}
            answered={details.parent.answeredCount}
          />
        </View>
        <Text
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: tokens.radius.pill,
            background: "#3a2f22",
            color: tokens.color.current,
            border: `3px solid ${tokens.bg.page}`,
            fontSize: 12,
            fontWeight: 800,
            fontStyle: "italic",
          }}
        >
          VS
        </Text>
      </View>

      {/* 亲子互动小贴士 */}
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
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 1.7 }}>
          <Text style={{ fontWeight: 800, color: tokens.color.currentStrong }}>
            亲子互动小贴士：
          </Text>
          今晚睡前带孩子把这一轮的诗词或成语再复颂一遍，印象会更深哦！
        </Text>
      </View>

      <Button
        aria-label="再来一局"
        onClick={onReplay}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          minHeight: 64,
          margin: `${tokens.space[4]}px 0 0`,
          border: "none",
          borderRadius: tokens.radius.xl,
          background: tokens.gradient.cta,
          boxShadow: tokens.shadow.kidBtn,
          color: tokens.bg.surface,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        <Text aria-hidden="true" style={{ marginRight: 2 }}>
          🔄
        </Text>
        再来一局
        <Text
          aria-hidden="true"
          style={{ marginLeft: 4, fontSize: tokens.fontSize.sm, fontWeight: 600, opacity: 0.9 }}
        >
          （换个主题决战）
        </Text>
      </Button>
      <Button
        aria-label="回到学习路线"
        onClick={onExit}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          minHeight: 48,
          margin: `${tokens.space[2]}px 0 0`,
          border: "1px solid #e7dcc4",
          borderRadius: tokens.radius.xl,
          background: tokens.bg.surface,
          color: tokens.color.textSoft,
          fontSize: tokens.fontSize.sm,
          fontWeight: 700,
        }}
      >
        <Text aria-hidden="true" style={{ marginRight: 2 }}>
          🗺️
        </Text>
        回到学习路线
      </Button>
    </View>
  );
}
