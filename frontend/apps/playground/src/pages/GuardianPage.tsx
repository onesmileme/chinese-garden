import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  GUARDIAN_SETTING_ITEMS,
  type GuardianSettingsStore,
} from "@cc/application";
import { tokens } from "@cc/ui";
import { browserGuardianSettings } from "../guardian-settings";
import { Card, PageShell } from "../layout";
import { navigate } from "../router";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../session-state";
import { clearBrowserLearningRecords } from "../store";

export interface GuardianPageProps {
  state?: SessionState;
  settings?: GuardianSettingsStore;
  clearRecords?: () => Promise<void>;
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

function SettingRow({
  item,
  checked,
  onChange,
}: {
  item: (typeof GUARDIAN_SETTING_ITEMS)[number];
  checked: boolean;
  onChange(enabled: boolean): void;
}) {
  return (
    <label
      data-setting-key={item.key}
      style={{
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: tokens.space[3],
        borderBottom: `1px solid ${tokens.color.locked}`,
        cursor: item.supported ? "pointer" : "not-allowed",
      }}
    >
      <span>
        <span style={{ display: "block", fontWeight: 700 }}>
          {item.label}
        </span>
        {item.description ? (
          <small style={{ color: tokens.color.textSoft }}>
            {item.description}
          </small>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={item.label}
        checked={checked}
        disabled={!item.supported}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{ width: 44, height: 28 }}
      />
    </label>
  );
}

export function GuardianPage({
  state = sessionState,
  settings = browserGuardianSettings,
  clearRecords = clearBrowserLearningRecords,
}: GuardianPageProps) {
  const app = useSessionSnapshot(state);
  const guardian = useSyncExternalStore(
    settings.subscribe,
    settings.getState,
    settings.getState,
  );
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    void settings.ready().catch(() => undefined);
  }, [settings]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (confirmingClear) cancelButton.current?.focus();
  }, [confirmingClear]);

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
          label="累计成长值"
          value={`${app.progression.lifetimeXp}`}
        />
        <Row label="已完成天数" value={`${app.settledDayCount} 天`} />
      </Card>
      <Card>
        <h2>声音与体验</h2>
        {GUARDIAN_SETTING_ITEMS.map((item) => (
          <SettingRow
            key={item.key}
            item={item}
            checked={guardian.settings[item.key]}
            onChange={(enabled) => {
              void settings.update(item.key, enabled);
            }}
          />
        ))}
        {guardian.error ? (
          <p role="alert" style={{ color: "#a52a2a" }}>
            {guardian.error}
          </p>
        ) : null}
      </Card>
      <Card>
        <h2>数据管理</h2>
        <button
          type="button"
          onClick={() => {
            setClearError(null);
            setConfirmingClear(true);
          }}
          style={{
            width: "100%",
            minHeight: 64,
            border: "1px solid #a52a2a",
            borderRadius: tokens.radius.md,
            background: "transparent",
            color: "#a52a2a",
            fontSize: tokens.fontSize.md,
            fontWeight: 700,
          }}
        >
          清除学习记录
        </button>
      </Card>
      {confirmingClear ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-records-title"
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: tokens.space[4],
            background: "rgba(0, 0, 0, 0.42)",
          }}
        >
          <div
            style={{
              width: "min(360px, 100%)",
              padding: tokens.space[4],
              borderRadius: tokens.radius.lg,
              background: tokens.bg.surface,
            }}
          >
            <h2 id="clear-records-title">确认清除学习记录？</h2>
            <p>将清除学习进度、成长记录和未同步事件，清除后无法恢复。</p>
            {clearError ? (
              <p role="alert" style={{ color: "#a52a2a" }}>
                {clearError}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: tokens.space[3] }}>
              <button
                ref={cancelButton}
                type="button"
                disabled={clearing}
                onClick={() => setConfirmingClear(false)}
                style={{ minHeight: 48, flex: 1 }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => {
                  setClearing(true);
                  setClearError(null);
                  void clearRecords()
                    .then(() => {
                      if (mounted.current) setConfirmingClear(false);
                    })
                    .catch(() => {
                      if (mounted.current) {
                        setClearError("清除学习记录失败，请重试");
                      }
                    })
                    .finally(() => {
                      if (mounted.current) setClearing(false);
                    });
                }}
                style={{
                  minHeight: 48,
                  flex: 1,
                  borderColor: "#a52a2a",
                  color: "#a52a2a",
                }}
              >
                {clearing ? "正在清除…" : "确认清除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
