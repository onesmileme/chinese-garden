import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button, Text, View } from "@tarojs/components";
import {
  createFirstSubmissionTracker,
  EventQueue,
  describeKnowledgePoint,
  knowledgePointTitle,
  materializeDailyQuestions,
  stableAnswerEventId,
  submitAnswer,
  type ActiveDailySession,
} from "@cc/application";
import {
  InkBackground,
  QuestionFlow,
  QuestionProgressHeader,
  QuestionStage,
  cueFor,
  tokens,
  type QuestionCue,
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

const STAGE_TITLES = ["热身", "学新招", "巩固挑战"] as const;

export interface LessonPageProps {
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

function completedStageTitle(
  nextIndex: number,
): (typeof STAGE_TITLES)[number] | undefined {
  if (nextIndex === 5) return "热身";
  if (nextIndex === 10) return "学新招";
  if (nextIndex === 15) return "巩固挑战";
  return undefined;
}

export default function LessonPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
}: LessonPageProps) {
  const runtime = useRuntimeContent();
  const corpus = runtime.corpus;
  const childProfileId = runtime.childProfileId;
  const app = useSessionSnapshot(state);
  const [busy, setBusy] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const active = app.activeDaily;
  const steps = useMemo(
    () =>
      active === null
        ? []
        : materializeDailyQuestions(
            active.session,
            corpus,
            (kpId) => describeKnowledgePoint(corpus, kpId),
          ),
    [active?.session, corpus],
  );
  const question =
    active === null ? undefined : steps[active.currentIndex]?.question;
  const flowQuestion = useMemo(
    () => (question === undefined ? undefined : { ...question }),
    [question, retryRevision],
  );
  const shouldRedirect =
    active === null ||
    active.currentIndex > 15 ||
    (active.currentIndex === 15 &&
      active.pendingStageCompletion === undefined);
  const questionKey =
    active === null ||
    shouldRedirect ||
    active.pendingStageCompletion !== undefined ||
    steps[active.currentIndex] === undefined
      ? null
      : JSON.stringify([
          active.session.sessionId,
          active.currentIndex,
          steps[active.currentIndex]!.question.seed,
        ]);
  const attemptTrackerRef = useRef(createFirstSubmissionTracker());

  useEffect(() => {
    if (shouldRedirect) redirectHome();
  }, [shouldRedirect]);

  useEffect(() => {
    if (questionKey === null) {
      attemptTrackerRef.current.clear();
    }
  }, [questionKey]);

  if (active === null || shouldRedirect) return null;

  if (active.pendingStageCompletion !== undefined) {
    return (
      <InkBackground>
        <View style={styles.page}>
          <View role="dialog" aria-modal="true" style={styles.reward}>
            <Text style={styles.rewardTitle}>
              {active.pendingStageCompletion} · 阶段完成
            </Text>
            <Text>做得好，本组任务已经完成！</Text>
            <Button
              style={styles.primaryButton}
              onClick={() => {
                const {
                  pendingStageCompletion: _pending,
                  ...withoutPending
                } = active;
                state.setActiveDaily(withoutPending);
                redirectHome();
              }}
            >
              回到任务路线
            </Button>
          </View>
        </View>
      </InkBackground>
    );
  }

  const step = steps[active.currentIndex];
  if (step === undefined) {
    redirectHome();
    return null;
  }
  const currentActive = active;
  const currentStep = step;

  function freezeFirstAttempt(
    chosenAnswer: string,
    correct: boolean,
  ): void {
    if (questionKey === null) return;
    attemptTrackerRef.current.freeze(
      questionKey,
      chosenAnswer,
      correct,
      now(),
    );
  }

  function markQuestionReady(): void {
    if (questionKey === null) return;
    attemptTrackerRef.current.present(questionKey, now());
  }

  async function answer(
    correct: boolean,
    chosenAnswer: string,
  ): Promise<void> {
    if (questionKey === null) return;
    const at = currentActive.currentIndex;
    const attempt =
      attemptTrackerRef.current.get(questionKey) ??
      attemptTrackerRef.current.freeze(
        questionKey,
        chosenAnswer,
        correct,
        now(),
      );
    try {
      await submitAnswer(
        {
          queue,
          idGen: {
            ulid: () =>
              stableAnswerEventId(currentActive.session.sessionId, at),
          },
          clock: { now: () => attempt.occurredAt },
        },
        {
          session: currentActive.session,
          childProfileId,
          deviceId: "miniapp-device",
          knowledgePointId: currentStep.kpId,
          questionType: currentStep.question.questionType,
          questionSeed: currentStep.question.seed,
          questionIndex: at,
          chosenAnswer: attempt.chosenAnswer,
          correctAnswer: currentStep.question.correctAnswer,
          acceptedAnswers: currentStep.question.acceptedAnswers,
          responseTimeMs: attempt.responseTimeMs,
          hintCount: 0,
          firstAttempt: true,
          clientSequence: at,
        },
      );
    } catch (error) {
      if (attempt.correct) setRetryRevision((current) => current + 1);
      throw error;
    }

    const nextIndex = at + 1;
    const firstAttemptOutcomes = [
      ...currentActive.firstAttemptOutcomes,
      attempt.correct,
    ];
    const stageTitle = completedStageTitle(nextIndex);
    const next: ActiveDailySession = {
      ...currentActive,
      currentIndex: nextIndex,
      firstAttemptOutcomes,
      updatedAt: attempt.submittedAt,
      ...(stageTitle === undefined
        ? {}
        : { pendingStageCompletion: stageTitle }),
    };
    state.setActiveDaily(next);
    if (nextIndex === 15) {
      state.setLastSession({
        sessionId: currentActive.session.sessionId,
        firstAttemptOutcomes,
        answeredCount: firstAttemptOutcomes.length,
      });
    }
  }

  function playCue(cue: QuestionCue): void {
    platform.cue(cueFor(cue));
  }

  return (
    <InkBackground>
      <View style={styles.page}>
        <QuestionProgressHeader
          title={STAGE_TITLES[currentStep.levelIndex] ?? "今日学习"}
          knowledgeTitle={`正在学习：${knowledgePointTitle(
            corpus,
            currentStep.kpId,
          )}`}
          current={currentStep.slotIndex + 1}
          total={5}
          overallCurrent={active.currentIndex + 1}
          overallTotal={15}
          rewardHint="做完本组可得奖励"
          busy={busy}
          onBack={() => {
            void backToHome();
          }}
        />
        <QuestionStage>
          <QuestionFlow
            question={flowQuestion ?? currentStep.question}
            onQuestionReady={markQuestionReady}
            onAnswerSelected={freezeFirstAttempt}
            onAnswered={answer}
            onCue={playCue}
            onBusyChange={setBusy}
          />
        </QuestionStage>
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
  reward: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.space[4],
    padding: tokens.space[5],
    borderRadius: tokens.radius.md,
    background: tokens.color.surface,
  },
  rewardTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: 800,
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
