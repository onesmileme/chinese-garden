import {
  type ComponentProps,
  type ComponentType,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, Switch, Text, View } from "@tarojs/components";
import {
  GUARDIAN_SETTING_ITEMS,
  type GuardianSettingsStore,
} from "@cc/application";
import { InkBackground, tokens } from "@cc/ui";
import {
  clearMiniappLearningRecords,
  guardianSettings,
} from "../../guardian-settings";
import { backToHome } from "../../platform/custom-navigation";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../../session-state";

const FocusableButton = Button as ComponentType<
  ComponentProps<typeof Button> & { focus?: boolean }
>;

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

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
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
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description ? (
          <Text style={styles.settingDescription}>{item.description}</Text>
        ) : null}
      </View>
      <Switch
        aria-label={item.label}
        checked={checked}
        disabled={!item.supported}
        onChange={(event) => onChange(event.detail.value)}
      />
    </View>
  );
}

export default function GuardianPage({
  state = sessionState,
  settings = guardianSettings,
  clearRecords = clearMiniappLearningRecords,
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
            label="累计成长值"
            value={`${app.progression.lifetimeXp}`}
          />
          <DataRow
            label="已完成天数"
            value={`${app.settledDayCount} 天`}
          />
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>声音与体验</Text>
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
            <View role="alert">
              <Text style={styles.error}>{guardian.error}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>数据管理</Text>
          <Button
            aria-label="清除学习记录"
            style={styles.dangerButton}
            onClick={() => {
              setClearError(null);
              setConfirmingClear(true);
            }}
          >
            清除学习记录
          </Button>
        </View>
        {confirmingClear ? (
          <View
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-records-title"
            style={styles.dialogBackdrop}
          >
            <View style={styles.dialog}>
              <Text id="clear-records-title" style={styles.dialogTitle}>
                确认清除学习记录？
              </Text>
              <Text style={styles.dialogCopy}>
                将清除学习进度、成长记录和未同步事件，清除后不可恢复。
              </Text>
              {clearError ? (
                <View role="alert">
                  <Text style={styles.error}>{clearError}</Text>
                </View>
              ) : null}
              <View style={styles.dialogActions}>
                <FocusableButton
                  aria-label="取消"
                  focus
                  disabled={clearing}
                  style={styles.dialogButton}
                  onClick={() => setConfirmingClear(false)}
                >
                  取消
                </FocusableButton>
                <Button
                  aria-label="确认清除"
                  disabled={clearing}
                  style={{
                    ...styles.dialogButton,
                    ...styles.confirmButton,
                  }}
                  onClick={() => {
                    setClearing(true);
                    setClearError(null);
                    void clearRecords()
                      .then(() => {
                        if (mounted.current) setConfirmingClear(false);
                      })
                      .catch(() => {
                        if (mounted.current) {
                          setClearError("学习记录清除失败，请重试");
                        }
                      })
                      .finally(() => {
                        if (mounted.current) setClearing(false);
                      });
                  }}
                >
                  {clearing ? "正在清除…" : "确认清除"}
                </Button>
              </View>
            </View>
          </View>
        ) : null}
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
  settingRow: {
    minHeight: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space[3],
    borderBottom: `1px solid ${tokens.color.locked}`,
  },
  settingCopy: {
    flex: 1,
  },
  settingLabel: {
    display: "block",
    fontWeight: 700,
  },
  settingDescription: {
    display: "block",
    color: tokens.color.textSoft,
    fontSize: tokens.fontSize.sm,
  },
  error: {
    display: "block",
    marginTop: tokens.space[3],
    color: tokens.color.wrong,
  },
  dangerButton: {
    width: "100%",
    minHeight: 64,
    border: `1px solid ${tokens.color.wrong}`,
    borderRadius: tokens.radius.md,
    background: "transparent",
    color: tokens.color.wrong,
    fontSize: tokens.fontSize.md,
    fontWeight: 700,
  },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space[4],
    background: "rgba(0, 0, 0, 0.42)",
    zIndex: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    boxSizing: "border-box",
    padding: tokens.space[4],
    borderRadius: tokens.radius.lg,
    background: tokens.color.surface,
  },
  dialogTitle: {
    display: "block",
    marginBottom: tokens.space[3],
    fontSize: tokens.fontSize.md,
    fontWeight: 800,
  },
  dialogCopy: {
    display: "block",
    color: tokens.color.textSoft,
  },
  dialogActions: {
    display: "flex",
    gap: tokens.space[3],
    marginTop: tokens.space[4],
  },
  dialogButton: {
    minHeight: 48,
    flex: 1,
  },
  confirmButton: {
    borderColor: tokens.color.wrong,
    color: tokens.color.wrong,
  },
} as const;
