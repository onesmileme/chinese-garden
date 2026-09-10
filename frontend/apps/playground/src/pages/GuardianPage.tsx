import { useSyncExternalStore } from "react";
import { Card, PageShell } from "../layout";
import { navigate } from "../router";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../session-state";

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function GuardianPage({
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
    <PageShell title="家长中心" decor={false}>
      <button
        type="button"
        onClick={() => navigate("/home")}
        style={{
          marginBottom: 12,
          border: "none",
          background: "transparent",
          fontSize: 16,
        }}
      >
        ← 返回首页
      </button>
      <Card>
        <h2>学习状态</h2>
        <Row label="能力探索" value={assessmentStatus} />
        <Row label="今日进度" value={dailyStatus} />
      </Card>
      <Card>
        <h2>成长记录</h2>
        <Row label="当前等级" value={`Lv.${app.progression.level}`} />
        <Row
          label="累计经验"
          value={`${app.progression.lifetimeXp} XP`}
        />
        <Row label="已完成天数" value={`${app.settledDayCount} 天`} />
      </Card>
    </PageShell>
  );
}
