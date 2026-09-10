import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, Text, View } from "@tarojs/components";
import {
  EventQueue,
  makeEvent,
  settleDay,
  stableSettlementEventId,
  type DaySettlement,
} from "@cc/application";
import {
  InkBackground,
  buildCelebration,
  cueFor,
  mascotVM,
  tokens,
} from "@cc/ui";
import {
  backToHome,
  redirectHome,
} from "../../platform/custom-navigation";
import { platform } from "../../platform";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../../session-state";
import { clock, eventQueue } from "../../store";
import { useRuntimeContent } from "../../content/runtime";

const BASE_XP = 20;

export interface SummaryPageProps {
  state?: SessionState;
  queue?: EventQueue;
  now?: () => number;
}

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

export default function SummaryPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
}: SummaryPageProps) {
  const runtime = useRuntimeContent();
  const childProfileId = runtime.childProfileId;
  const app = useSessionSnapshot(state);
  const [settlement, setSettlement] = useState<DaySettlement | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const started = useRef(false);
  const inFlight = useRef(false);
  const active = app.activeDaily;
  const session = app.lastSession;
  const canSettle =
    active !== null &&
    active.currentIndex >= 15 &&
    session !== null &&
    session.sessionId === active.session.sessionId &&
    session.answeredCount === 15 &&
    session.firstAttemptOutcomes.length === 15;

  useEffect(() => {
    if (!canSettle && !started.current) redirectHome();
  }, [canSettle]);

  useEffect(() => {
    if (
      !canSettle ||
      active === null ||
      session === null ||
      inFlight.current
    ) {
      return;
    }
    started.current = true;
    inFlight.current = true;
    setFailed(false);
    const result = settleDay({
      firstAttemptOutcomes: session.firstAttemptOutcomes,
      baseXp: BASE_XP,
    });
    const eventId = stableSettlementEventId(session.sessionId);
    const event = makeEvent(
      { ulid: () => eventId },
      { now },
      {
        childProfileId,
        deviceId: "miniapp-device",
        sessionId: session.sessionId,
        eventType: "DAY_SETTLED",
        clientSequence: session.answeredCount,
        contentVersion: active.session.contentVersion,
        ruleVersion: active.session.ruleVersion,
        payload: {
          xpAwarded: result.xpAwarded,
          accuracyBonus: result.accuracyBonus,
          firstCorrectRate: result.firstCorrectRate,
        },
      },
    );

    void queue
      .enqueueOnce(event)
      .then(() => {
        if (!state.getState().progression.appliedEventIds.includes(eventId)) {
          state.recordSettlement(result, eventId);
        }
        if (
          state.getState().activeDaily?.session.sessionId ===
          session.sessionId
        ) {
          state.clearDailyProgress();
        }
        setSettlement(result);
        platform.cue(cueFor("celebrate"));
      })
      .catch(() => setFailed(true))
      .finally(() => {
        inFlight.current = false;
      });
  }, [
    active,
    canSettle,
    childProfileId,
    now,
    queue,
    retryToken,
    session,
    state,
  ]);

  if (!canSettle && !started.current) return null;
  const celebration =
    settlement === null ? null : buildCelebration(settlement);

  return (
    <InkBackground>
      <View style={styles.page}>
        {failed ? (
          <View style={styles.panel}>
            <Text>结算失败，请重试</Text>
            <Button
              style={styles.primaryButton}
              onClick={() => {
                setFailed(false);
                setRetryToken((token) => token + 1);
              }}
            >
              重试结算
            </Button>
          </View>
        ) : settlement !== null && celebration !== null ? (
          <View style={styles.panel}>
            <Text style={styles.mascot}>
              {mascotVM("celebrate").emoji}
            </Text>
            <Text style={styles.title}>{celebration.headline}</Text>
            <Text aria-label={`${celebration.stars} 星`} style={styles.stars}>
              {Array.from(
                { length: celebration.stars },
                () => "⭐",
              ).join("")}
            </Text>
            <Text>获得 XP {settlement.xpAwarded}</Text>
            <Text>正确率奖励 +{settlement.accuracyBonus} XP</Text>
            <Text>
              首次正确率{" "}
              {Math.round(settlement.firstCorrectRate * 100)}%
            </Text>
            <Button
              style={styles.primaryButton}
              onClick={() => {
                void backToHome();
              }}
            >
              返回首页
            </Button>
          </View>
        ) : (
          <Text>正在结算…</Text>
        )}
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
  panel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.space[3],
    padding: tokens.space[5],
    borderRadius: tokens.radius.md,
    background: tokens.color.surface,
  },
  mascot: {
    fontSize: 72,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontWeight: 800,
    color: tokens.color.currentStrong,
  },
  stars: {
    fontSize: tokens.fontSize.display,
  },
  primaryButton: {
    width: "100%",
    minHeight: tokens.control.optionMinHeight,
    borderRadius: tokens.radius.md,
    background: tokens.color.current,
    color: tokens.color.text,
    fontWeight: 800,
  },
} as const;
