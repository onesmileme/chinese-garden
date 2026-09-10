import { useEffect, useMemo, useRef, useState } from "react";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
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
  InkBackground,
  ChallengeHandoff,
  ChallengeQuestion,
  ChallengeResult,
  ChallengeSetup,
  ChallengeTurnHeader,
  QuestionBackButton,
  QuestionStage,
  tokens,
  type ChallengeSetupSelection,
} from "@cc/ui";
import { routes } from "../../platform/custom-navigation";
import {
  getState,
  recordChallengeResult,
  setActiveChallenge,
  useAppState,
} from "../../session-state";
import {
  clock as appClock,
  eventQueue as appEventQueue,
  idGen,
} from "../../store";
import { useRuntimeContent } from "../../content/runtime";
import { platform } from "../../platform";

const recentChallengeStore = new SnapshotRecentChallengeStore(
  platform.snapshots,
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

export default function ChallengePage({
  content: contentOverride,
  queue = appEventQueue,
  clock = appClock,
  recentChallenges = recentChallengeStore,
}: ChallengePageProps = {}) {
  const runtime = useRuntimeContent();
  const challengePageContent =
    contentOverride ??
    {
      corpus: runtime.corpus,
      contentVersion: runtime.manifest.version,
    };
  const { corpus, contentVersion } = challengePageContent;
  const abilityLevel = runtime.manifest.abilityLevel;
  const contentSelection =
    contentOverride === undefined
      ? contentSelectionOf(runtime)
      : {
          childProfileId: "miniapp-child",
          authentication: "GUEST" as const,
          version: contentVersion,
          abilityLevel,
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
  const hidden = useRef(false);
  const completionAttempt = useRef<PendingCompletionAttempt | null>(null);
  const answerAttempt = useRef<PendingAnswerAttempt | null>(null);
  const renderedChallengeId = useRef(active?.challengeId ?? null);

  const availableDimensions = useMemo(
    () =>
      app.challengeSource
        ? availableChallengeDimensions(
            app.challengeSource.childDifficulty,
            corpus,
            abilityLevel,
          )
        : [],
    [abilityLevel, app.challengeSource?.childDifficulty, corpus],
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
    void Taro.redirectTo({ url: routes.home });
  }, [active, app.challengeSource, result]);

  useEffect(() => {
    if (!active || renderedChallengeId.current === active.challengeId) return;
    renderedChallengeId.current = active.challengeId;
    completionAttempt.current = null;
    answerAttempt.current = null;
    setCompletionFailed(false);
    setResult(null);
  }, [active?.challengeId]);

  useDidHide(() => {
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
  });

  useDidShow(() => {
    hidden.current = false;
    const current = getState().activeChallenge;
    if (current && isAnswerTurn(current) && current.paused) {
      const pending = answerAttempt.current;
      if (pending && matchesPendingAnswer(current, pending)) return;
      setActiveChallenge(
        resumeChallenge(current, clock.now()) as ActiveChallengeSession,
      );
    }
  });

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
          abilityLevel,
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
        { queue, clock, deviceId: "miniapp-device" },
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
            deviceId: "miniapp-device",
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
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.redirectTo({ url: routes.home }),
    );
  };

  let content;
  if (result) {
    content = (
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
        onExit={() => {
          void Taro.redirectTo({ url: routes.home });
        }}
      />
    );
  } else if (!active) {
    content =
      app.challengeSource && availableDimensions.length > 0 ? (
        <View>
          <ChallengeSetup
            key={setupKey}
            availableDimensions={availableDimensions}
            onCancel={leaveChallenge}
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
            <Text
              style={{
                display: "block",
                marginTop: tokens.space[3],
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              {setupError}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text>正在返回学习路线…</Text>
      );
  } else if (active.phase === "HANDOFF") {
    content = (
      <View>
        <ChallengeHandoff
          target={active.handoffTarget!}
          onContinue={continueFromHandoff}
        />
        {completionFailed ? (
          <View role="alert">
            <Text>保存失败，请重试</Text>
          </View>
        ) : null}
      </View>
    );
  } else if (questionState.failed || !questionState.question) {
    content = (
      <View style={{ textAlign: "center" }}>
        <Text style={{ display: "block" }}>这道题暂时没有准备好</Text>
        <Button
          onClick={() => setQuestionRetry((value) => value + 1)}
          style={{ minHeight: 64, marginTop: tokens.space[3] }}
        >
          重试题目
        </Button>
      </View>
    );
  } else {
    const turn = active.phase === "CHILD_TURN" ? active.child : active.parent;
    const restoredWrongAnswer = pendingWrongAnswer(active);
    content = (
      <View>
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
      </View>
    );
  }

  return (
    <InkBackground>
      <View style={pageStyle}>{content}</View>
    </InkBackground>
  );
}

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: tokens.space[4],
  color: tokens.color.text,
} as const;
