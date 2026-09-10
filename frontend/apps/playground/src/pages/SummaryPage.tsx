import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  EventQueue,
  makeEvent,
  settleDay,
  stableSettlementEventId,
  type DaySettlement,
} from "@cc/application";
import {
  buildCelebration,
  cueFor,
  mascotVM,
  tokens,
  type Cue,
} from "@cc/ui";
import { Card, PageShell, PrimaryButton } from "../layout";
import { createBrowserCuePlayer } from "../mock/cue-player";
import { navigate } from "../router";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../session-state";
import { clock, eventQueue } from "../store";
import { useRuntimeContent } from "../content/runtime";

export interface SummaryPageProps {
  state?: SessionState;
  queue?: EventQueue;
  now?: () => number;
  cuePlayer?: CuePlayer;
}

const BASE_XP = 20;
const defaultCuePlayer = createBrowserCuePlayer();

interface CuePlayer {
  play(cue: Cue): void;
}

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

export function SummaryPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
  cuePlayer = defaultCuePlayer,
}: SummaryPageProps) {
  const runtime = useRuntimeContent();
  const childProfileId = runtime.childProfileId;
  const app = useSessionSnapshot(state);
  const [settlement, setSettlement] = useState<DaySettlement | null>(null);
  const [settlementError, setSettlementError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const settlementStarted = useRef(false);
  const settlementInFlight = useRef(false);
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
    if (!canSettle && !settlementStarted.current) navigate("/home");
  }, [canSettle]);

  useEffect(() => {
    if (settlement === null) return;
    try {
      cuePlayer.play(cueFor("celebrate"));
    } catch {
      // Celebration feedback is optional and must not block navigation.
    }
  }, [cuePlayer, settlement]);

  useEffect(() => {
    if (
      !canSettle ||
      active === null ||
      session === null ||
      settlementInFlight.current
    ) {
      return;
    }

    settlementStarted.current = true;
    settlementInFlight.current = true;
    setSettlementError(false);
    const result = settleDay({
      firstAttemptOutcomes: session.firstAttemptOutcomes,
      baseXp: BASE_XP,
    });
    const eventId = stableSettlementEventId(session.sessionId);
    const event = makeEvent({ ulid: () => eventId }, { now }, {
      childProfileId,
      deviceId: "debug-web",
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
    });

    void queue
      .enqueueOnce(event)
      .then(() => {
        const latest = state.getState();
        if (!latest.progression.appliedEventIds.includes(eventId)) {
          state.recordSettlement(result, eventId);
        }
        if (
          state.getState().activeDaily?.session.sessionId ===
          session.sessionId
        ) {
          state.clearDailyProgress();
        }
        setSettlement(result);
      })
      .catch(() => {
        setSettlementError(true);
      })
      .finally(() => {
        settlementInFlight.current = false;
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

  if (!canSettle && !settlementStarted.current) return null;

  const celebration =
    settlement === null ? null : buildCelebration(settlement);

  return (
    <PageShell title="今日结算">
      {settlementError ? (
        <>
          <div>结算失败，请重试</div>
          <PrimaryButton
            onClick={() => {
              setSettlementError(false);
              setRetryToken((token) => token + 1);
            }}
          >
            重试结算
          </PrimaryButton>
        </>
      ) : settlement !== null && celebration !== null ? (
        <Card>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 72 }}>
              {mascotVM("celebrate").emoji}
            </div>
            <h1 style={{ color: tokens.color.currentStrong }}>
              {celebration.headline}
            </h1>
            <div
              aria-label={`${celebration.stars} 星`}
              style={{
                marginBottom: tokens.space[4],
                fontSize: tokens.fontSize.display,
              }}
            >
              {Array.from({ length: celebration.stars }, () => "⭐").join("")}
              <span style={{ fontSize: tokens.fontSize.md }}>
                {celebration.stars} 星
              </span>
            </div>
            <p>获得 XP {settlement.xpAwarded}</p>
            <p>正确率奖励 +{settlement.accuracyBonus} XP</p>
            <p>
              首次正确率{" "}
              {Math.round(settlement.firstCorrectRate * 100)}%
            </p>
            <PrimaryButton onClick={() => navigate("/home")}>
              返回首页
            </PrimaryButton>
          </div>
        </Card>
      ) : (
        <div>正在结算…</div>
      )}
    </PageShell>
  );
}
