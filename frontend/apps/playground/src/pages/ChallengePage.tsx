import { useEffect, useMemo, useRef, useState } from "react";
import {
  contentSelectionOf,
  persistChallengeAnswer,
  persistChallengeCompletion,
  SnapshotRecentChallengeStore,
  type Clock,
  type ActiveChallengeSession,
  type EventQueue,
  type RecentChallengeStore,
} from "@cc/application";
import type { ContentLevel } from "@cc/content-schema";
import {
  availableChallengeDimensions,
  ChallengeCapacityError,
  CHALLENGE_DURATION_MS,
  CHALLENGE_QUESTION_COUNT,
  CHALLENGE_RULE_VERSION,
  challengeTurnQuestionCount,
  confirmWrongFeedback,
  continueHandoff,
  createChallenge,
  finishExpiredTurn,
  pauseChallenge,
  questionForTurn,
  remainingTurnMs,
  resumeChallenge,
  type ChallengeDimension,
  type ChallengeMode,
  type ChallengeResultDetails,
  type Corpus,
  type GeneratedQuestion,
  type ParentTier,
} from "@cc/domain";
import {
  ChallengeHandoff,
  ChallengeQuestion,
  ChallengeResult,
  ChallengeSetup,
  ChallengeTurnHeader,
  QuestionBackButton,
  QuestionStage,
  type ChallengeSetupSelection,
} from "@cc/ui";
import { PageShell } from "../layout";
import { navigate } from "../router";
import {
  getState,
  recordChallengeResult,
  setActiveChallenge,
  useAppState,
} from "../session-state";
import {
  clock as appClock,
  eventQueue as appEventQueue,
  idGen,
} from "../store";
import { useRuntimeContent } from "../content/runtime";
import { browserSnapshotStorage } from "../session-snapshot-storage";

const recentChallengeStore = new SnapshotRecentChallengeStore(
  browserSnapshotStorage,
  appClock,
);

interface ReplayDefaults {
  dimension: ChallengeDimension;
  mode: ChallengeMode;
  tier: ParentTier;
}

export interface ChallengePageProps {
  content?: {
    corpus: Corpus;
    contentVersion: string;
  };
  abilityLevel?: ContentLevel;
  queue?: EventQueue;
  clock?: Clock;
  recentChallenges?: RecentChallengeStore;
}

function isAnswerTurn(
  session: ActiveChallengeSession,
): session is ActiveChallengeSession & {
  phase: "CHILD_TURN" | "PARENT_TURN";
} {
  return session.phase === "CHILD_TURN" || session.phase === "PARENT_TURN";
}

function pendingWrongAnswer(session: ActiveChallengeSession) {
  if (!isAnswerTurn(session)) return undefined;
  const turn = session.phase === "CHILD_TURN" ? session.child : session.parent;
  return turn.pendingWrongFeedback?.submittedAnswer;
}

interface PendingAnswerAttempt {
  challengeId: string;
  participant: "CHILD" | "PARENT";
  questionIndex: number;
  attemptsLength: number;
  answer: string;
  submittedAt: number;
}

function matchesPendingAnswer(
  session: ActiveChallengeSession | null,
  attempt: PendingAnswerAttempt,
): session is ActiveChallengeSession & {
  phase: "CHILD_TURN" | "PARENT_TURN";
} {
  if (!session || !isAnswerTurn(session)) return false;
  const turn = session.phase === "CHILD_TURN" ? session.child : session.parent;
  return (
    session.challengeId === attempt.challengeId &&
    turn.participant === attempt.participant &&
    turn.questionIndex === attempt.questionIndex &&
    turn.attempts.length === attempt.attemptsLength
  );
}

interface PendingCompletionAttempt {
  challengeId: string;
  handoffTarget: ActiveChallengeSession["handoffTarget"];
  childAttemptsLength: number;
  parentAttemptsLength: number;
  completedAt: number;
}

function matchesPendingCompletion(
  session: ActiveChallengeSession | null,
  attempt: PendingCompletionAttempt,
): boolean {
  return (
    session?.challengeId === attempt.challengeId &&
    session.phase === "HANDOFF" &&
    session.handoffTarget === attempt.handoffTarget &&
    session.child.attempts.length === attempt.childAttemptsLength &&
    session.parent.attempts.length === attempt.parentAttemptsLength
  );
}

export function ChallengePage({
  content: contentOverride,
  abilityLevel,
  queue = appEventQueue,
  clock = appClock,
  recentChallenges = recentChallengeStore,
}: ChallengePageProps = {}) {
  const runtime = useRuntimeContent();
  const content =
    contentOverride ??
    {
      corpus: runtime.corpus,
      contentVersion: runtime.manifest.version,
    };
  const { corpus, contentVersion } = content;
  const resolvedLevel = abilityLevel ?? runtime.manifest.abilityLevel;
  const contentSelection =
    contentOverride === undefined && abilityLevel === undefined
      ? contentSelectionOf(runtime)
      : {
          childProfileId: "debug-child",
          authentication: "GUEST" as const,
          version: contentVersion,
          abilityLevel: resolvedLevel,
        };
  const app = useAppState();
  const active = app.activeChallenge;
  const [setupKey, setSetupKey] = useState(0);
  const [result, setResult] = useState<ChallengeResultDetails | null>(null);
  const [replayDefaults, setReplayDefaults] = useState<ReplayDefaults | null>(
    null,
  );
  const [setupError, setSetupError] = useState<string | null>(null);
  const [questionRetry, setQuestionRetry] = useState(0);
  const [completionFailed, setCompletionFailed] = useState(false);
  const [nowMs, setNowMs] = useState(clock.now());
  const completionInFlight = useRef(false);
  const answerInFlight = useRef<symbol | null>(null);
  const hidden = useRef(document.visibilityState === "hidden");
  const completionAttempt = useRef<PendingCompletionAttempt | null>(null);
  const answerAttempt = useRef<PendingAnswerAttempt | null>(null);
  const renderedChallengeId = useRef(active?.challengeId ?? null);

  const availableDimensions = useMemo(
    () =>
      app.challengeSource
        ? availableChallengeDimensions(
            app.challengeSource.childDifficulty,
            corpus,
            resolvedLevel,
          )
        : [],
    [app.challengeSource?.childDifficulty, corpus, resolvedLevel],
  );

  const questionState = useMemo<{
    question: GeneratedQuestion | null;
    failed: boolean;
  }>(() => {
    if (!active || !isAnswerTurn(active)) {
      return { question: null, failed: false };
    }
    try {
      const session =
        active.paused &&
        answerAttempt.current &&
        matchesPendingAnswer(active, answerAttempt.current)
          ? { ...active, paused: false }
          : active;
      return { question: questionForTurn(session, corpus), failed: false };
    } catch {
      return { question: null, failed: true };
    }
  }, [
    active?.challengeId,
    active?.phase,
    active?.child.questionIndex,
    active?.parent.questionIndex,
    active?.config.tier,
    active?.paused,
    corpus,
    questionRetry,
  ]);

  useEffect(() => {
    if (active || result || app.challengeSource) return;
    navigate("/home");
  }, [active, app.challengeSource, result]);

  useEffect(() => {
    if (!active || renderedChallengeId.current === active.challengeId) return;
    renderedChallengeId.current = active.challengeId;
    completionAttempt.current = null;
    answerAttempt.current = null;
    setCompletionFailed(false);
    setResult(null);
  }, [active?.challengeId]);

  useEffect(() => {
    const onVisibility = () => {
      hidden.current = document.visibilityState === "hidden";
      const current = getState().activeChallenge;
      if (!current || !isAnswerTurn(current)) return;
      if (hidden.current && !current.paused) {
        const pending = answerAttempt.current;
        setActiveChallenge(
          pauseChallenge(
            current,
            pending && matchesPendingAnswer(current, pending)
              ? pending.submittedAt
              : clock.now(),
          ) as ActiveChallengeSession,
        );
      } else if (!hidden.current && current.paused) {
        const pending = answerAttempt.current;
        if (pending && matchesPendingAnswer(current, pending)) return;
        setActiveChallenge(
          resumeChallenge(current, clock.now()) as ActiveChallengeSession,
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (
      !active ||
      !isAnswerTurn(active) ||
      active.paused ||
      active.config.mode !== "TIMED"
    ) {
      return;
    }
    const timer = setInterval(() => {
      const current = getState().activeChallenge;
      const pending = answerAttempt.current;
      if (
        answerInFlight.current &&
        pending &&
        matchesPendingAnswer(current, pending)
      ) {
        return;
      }
      const now = clock.now();
      setNowMs(now);
      if (!current) return;
      const next = finishExpiredTurn(current, now);
      if (next !== current) {
        setActiveChallenge(next as ActiveChallengeSession);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [active?.challengeId, active?.phase, active?.paused, active?.config.mode]);

  const start = (selection: ChallengeSetupSelection) => {
    if (!app.challengeSource) return;
    setSetupError(null);
    try {
      const session = createChallenge({
        challengeId: idGen.ulid(),
        config: {
          mode: selection.mode,
          tier: selection.tier,
          dimension: selection.dimension,
          childDifficulty: app.challengeSource.childDifficulty,
          abilityLevel: resolvedLevel,
          durationMs: CHALLENGE_DURATION_MS,
          questionCount: CHALLENGE_QUESTION_COUNT,
          contentVersion,
          ruleVersion: CHALLENGE_RULE_VERSION,
        },
        corpus,
        nowMs: clock.now(),
      });
      setQuestionRetry(0);
      setActiveChallenge({
        ...session,
        contentSelection,
      } as ActiveChallengeSession);
    } catch (error) {
      setSetupError(
        error instanceof ChallengeCapacityError
          ? `当前题库不足 ${CHALLENGE_QUESTION_COUNT} 道不重复题`
          : "这组题暂时无法开始，请换一个挑战世界",
      );
    }
  };

  const persistSubmittedAnswer = async (
    current: ActiveChallengeSession,
    answer: string,
  ): Promise<void> => {
    const turn =
      current.phase === "CHILD_TURN" ? current.child : current.parent;
    const frozen =
      answerAttempt.current &&
      matchesPendingAnswer(current, answerAttempt.current)
        ? answerAttempt.current
        : {
            challengeId: current.challengeId,
            participant: turn.participant,
            questionIndex: turn.questionIndex,
            attemptsLength: turn.attempts.length,
            answer,
            submittedAt: clock.now(),
          };
    answerAttempt.current = frozen;
    const request = Symbol("challenge-answer");
    answerInFlight.current = request;
    const submission =
      current.paused && matchesPendingAnswer(current, frozen)
        ? ({ ...current, paused: false } as ActiveChallengeSession)
        : current;
    try {
      let next = await persistChallengeAnswer(
        { queue, clock, deviceId: "playground-browser" },
        submission,
        frozen.answer,
        corpus,
        frozen.submittedAt,
      );
      if (!matchesPendingAnswer(getState().activeChallenge, frozen)) {
        if (answerAttempt.current === frozen) answerAttempt.current = null;
        return;
      }
      if (answerAttempt.current === frozen) answerAttempt.current = null;
      if (hidden.current && isAnswerTurn(next) && !next.paused) {
        next = pauseChallenge(
          next,
          clock.now(),
        ) as ActiveChallengeSession;
      }
      setActiveChallenge(next);
    } catch (error) {
      const latest = getState().activeChallenge;
      if (matchesPendingAnswer(latest, frozen) && !latest.paused) {
        setActiveChallenge(
          pauseChallenge(
            latest,
            frozen.submittedAt,
          ) as ActiveChallengeSession,
        );
      } else if (!matchesPendingAnswer(latest, frozen)) {
        if (answerAttempt.current === frozen) answerAttempt.current = null;
      }
      throw error;
    } finally {
      if (answerInFlight.current === request) {
        answerInFlight.current = null;
      }
    }
  };

  const saveSubmittedAnswer = async (answer: string) => {
    const current = getState().activeChallenge;
    if (!current || !isAnswerTurn(current)) return;
    await persistSubmittedAnswer(current, answer);
  };

  const answerConfirmed = async (correct: boolean, answer: string) => {
    const current = getState().activeChallenge;
    if (!current || !isAnswerTurn(current)) return;
    if (correct) {
      await persistSubmittedAnswer(current, answer);
      setQuestionRetry(0);
      return;
    }
    const next = confirmWrongFeedback(current, corpus, clock.now());
    setQuestionRetry(0);
    setActiveChallenge(next as ActiveChallengeSession);
  };

  const continueFromHandoff = async () => {
    if (completionInFlight.current) return;
    const current = getState().activeChallenge;
    if (!current) return;
    const previousAttempt = completionAttempt.current;
    const attempt =
      previousAttempt && matchesPendingCompletion(current, previousAttempt)
        ? previousAttempt
        : {
            challengeId: current.challengeId,
            handoffTarget: current.handoffTarget,
            childAttemptsLength: current.child.attempts.length,
            parentAttemptsLength: current.parent.attempts.length,
            completedAt: clock.now(),
          };
    const next = continueHandoff(current, attempt.completedAt);
    if (next.phase === "RESULT") {
      completionAttempt.current = attempt;
      completionInFlight.current = true;
      setCompletionFailed(false);
      try {
        const details = await persistChallengeCompletion(
          {
            queue,
            clock,
            deviceId: "playground-browser",
            recentChallenges,
          },
          next,
          current.contentSelection,
        );
        if (!matchesPendingCompletion(getState().activeChallenge, attempt)) {
          return;
        }
        if (!recordChallengeResult(details)) {
          throw new Error("challenge result was not persisted");
        }
        setResult(details);
      } catch {
        if (matchesPendingCompletion(getState().activeChallenge, attempt)) {
          setCompletionFailed(true);
        }
      } finally {
        completionInFlight.current = false;
      }
      return;
    }
    setQuestionRetry(0);
    setActiveChallenge(next as ActiveChallengeSession);
  };

  const leaveChallenge = () => {
    hidden.current = true;
    const current = getState().activeChallenge;
    if (current && isAnswerTurn(current) && !current.paused) {
      const pending = answerAttempt.current;
      setActiveChallenge(
        pauseChallenge(
          current,
          pending && matchesPendingAnswer(current, pending)
            ? pending.submittedAt
            : clock.now(),
        ) as ActiveChallengeSession,
      );
    }
    navigate("/home");
  };

  if (result) {
    return (
      <PageShell title="亲子趣味挑战">
        <ChallengeResult
          details={result}
          onReplay={() => {
            setReplayDefaults({
              dimension: replayDefaults?.dimension ?? availableDimensions[0]!,
              mode: result.replay.mode,
              tier: result.replay.tier,
            });
            setResult(null);
            setSetupKey((value) => value + 1);
          }}
          onExit={() => navigate("/home")}
        />
      </PageShell>
    );
  }

  if (!active) {
    if (!app.challengeSource || availableDimensions.length === 0) {
      return (
        <PageShell title="亲子趣味挑战">正在返回学习路线…</PageShell>
      );
    }
    return (
      <PageShell title="亲子趣味挑战">
        <ChallengeSetup
          key={setupKey}
          availableDimensions={availableDimensions}
          onCancel={() => navigate("/home")}
          onStart={start}
          {...(replayDefaults
            ? {
                initialDimension: replayDefaults.dimension,
                initialMode: replayDefaults.mode,
                initialTier: replayDefaults.tier,
              }
            : {})}
        />
        {setupError ? (
          <div
            role="alert"
            style={{ marginTop: 12, textAlign: "center", fontWeight: 700 }}
          >
            {setupError}
          </div>
        ) : null}
      </PageShell>
    );
  }

  if (active.phase === "HANDOFF") {
    return (
      <PageShell title="亲子趣味挑战">
        <ChallengeHandoff
          target={active.handoffTarget!}
          onContinue={continueFromHandoff}
        />
        {completionFailed ? (
          <div role="alert">保存失败，请重试</div>
        ) : null}
      </PageShell>
    );
  }

  if (questionState.failed || !questionState.question) {
    return (
      <PageShell title="亲子趣味挑战">
        <div style={{ textAlign: "center" }}>
          <p>这道题暂时没有准备好</p>
          <button
            type="button"
            onClick={() => setQuestionRetry((value) => value + 1)}
            style={{ minHeight: 64 }}
          >
            重试题目
          </button>
        </div>
      </PageShell>
    );
  }

  const turn = active.phase === "CHILD_TURN" ? active.child : active.parent;
  const restoredWrongAnswer = pendingWrongAnswer(active);
  return (
    <PageShell title="亲子趣味挑战" variant="question">
      <QuestionBackButton onBack={leaveChallenge} />
      <ChallengeTurnHeader
        participant={turn.participant}
        mode={active.config.mode}
        remainingMs={
          active.config.mode === "TIMED" ? remainingTurnMs(active, nowMs) : 0
        }
        current={turn.questionIndex + 1}
        total={challengeTurnQuestionCount(active, corpus)}
      />
      <QuestionStage>
        <ChallengeQuestion
          key={`${questionState.question.seed}:${turn.pendingWrongFeedback ? "pending" : "ready"}`}
          question={questionState.question}
          onAnswered={answerConfirmed}
          onWrongSubmitted={saveSubmittedAnswer}
          {...(restoredWrongAnswer !== undefined
            ? { initialWrongAnswer: restoredWrongAnswer }
            : {})}
        />
      </QuestionStage>
    </PageShell>
  );
}
