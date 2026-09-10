import { useSyncExternalStore } from "react";
import { Button, Text, View } from "@tarojs/components";
import { InkBackground, tokens } from "@cc/ui";
import { backToHome } from "../../platform/custom-navigation";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../../session-state";

export interface GuardianPageProps {
  state?: SessionState;
}

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function GuardianPage({
  state = sessionState,
}: GuardianPageProps) {
  const app = useSessionSnapshot(state);
  const assessmentStatus = app.assessmentCompleted
    ? "已完成"
    : app.activeAssessment === null
      ? "未开始"
      : `进行中 · 第 ${app.activeAssessment.questionIndex + 1} 题`;
  const dailyTotal =
    app.activeDaily?.session.levels.reduce(
      (total, level) => total + level.slots.length,
      0,
    ) ?? 15;
  const dailyStatus =
    app.lastSettlement !== null
      ? `已结算 · ${dailyTotal} / ${dailyTotal}`
      : app.activeDaily === null
        ? `未开始 · 0 / ${dailyTotal}`
        : `${Math.min(Math.max(app.activeDaily.currentIndex, 0), dailyTotal)} / ${dailyTotal}`;

  return (
    <InkBackground decor={false}>
      <View style={styles.page}>
        <View style={styles.topBar}>
          <Button
            aria-label="返回首页"
            style={styles.backButton}
            onClick={() => {
              void backToHome();
            }}
          >
            ‹
          </Button>
          <Text style={styles.title}>家长中心</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>学习状态</Text>
          <DataRow label="能力探索" value={assessmentStatus} />
          <DataRow label="今日进度" value={dailyStatus} />
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>成长记录</Text>
          <DataRow
            label="当前等级"
            value={`Lv.${app.progression.level}`}
          />
          <DataRow
            label="累计经验"
            value={`${app.progression.lifetimeXp} XP`}
          />
          <DataRow
            label="已完成天数"
            value={`${app.settledDayCount} 天`}
          />
        </View>
      </View>
    </InkBackground>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: tokens.space[4],
    color: tokens.color.text,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.space[3],
    marginBottom: tokens.space[4],
  },
  backButton: {
    width: tokens.control.backSize,
    height: tokens.control.backSize,
    borderRadius: tokens.radius.md,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontWeight: 800,
  },
  panel: {
    marginBottom: tokens.space[4],
    padding: tokens.space[4],
    borderRadius: tokens.radius.md,
    background: tokens.color.surface,
  },
  panelTitle: {
    display: "block",
    marginBottom: tokens.space[3],
    fontSize: tokens.fontSize.md,
    fontWeight: 800,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: tokens.space[3],
    padding: `${tokens.space[2]}px 0`,
  },
  value: {
    fontWeight: 800,
  },
} as const;
