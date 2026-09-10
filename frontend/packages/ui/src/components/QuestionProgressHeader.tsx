import { Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import { QuestionBackButton } from "./QuestionBackButton";

export interface QuestionProgressHeaderProps {
  title: string;
  knowledgeTitle: string;
  current: number;
  total: number;
  overallCurrent?: number;
  overallTotal?: number;
  rewardHint?: string;
  busy?: boolean;
  onBack(): void;
}

export function QuestionProgressHeader({
  title,
  knowledgeTitle,
  current,
  total,
  overallCurrent,
  overallTotal,
  rewardHint,
  busy = false,
  onBack,
}: QuestionProgressHeaderProps) {
  const displayCurrent =
    total > 0 ? Math.min(Math.max(current, 0), total) : 0;
  const progress = total > 0 ? (displayCurrent / total) * 100 : 0;

  return (
    <View>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[2],
        }}
      >
        <QuestionBackButton busy={busy} onBack={onBack} />
        <View
          style={{
            flex: 1,
            height: 12,
            borderRadius: 999,
            background: tokens.color.locked,
            overflow: "hidden",
          }}
        >
          <View
            data-progress-fill="true"
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 999,
              background: tokens.color.current,
            }}
          />
        </View>
        <Text style={{ minWidth: 44, textAlign: "right", fontWeight: 800 }}>
          {displayCurrent} / {total}
        </Text>
      </View>
      <Text
        style={{
          display: "block",
          marginTop: tokens.space[2],
          textAlign: "center",
          color: tokens.color.text,
        }}
      >
        {title} · {knowledgeTitle}
      </Text>
      {overallCurrent !== undefined && overallTotal !== undefined ? (
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[1],
            textAlign: "center",
            color: tokens.color.text,
          }}
        >
          ★ 今日 {overallCurrent} / {overallTotal}
          {rewardHint ? ` · ${rewardHint}` : ""}
        </Text>
      ) : null}
    </View>
  );
}
