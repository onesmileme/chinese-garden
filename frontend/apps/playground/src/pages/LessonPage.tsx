import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  type Corpus,
} from "@cc/domain";
import {
  cueFor,
  QuestionFlow,
  QuestionProgressHeader,
  QuestionStage,
  tokens,
  type Cue,
  type QuestionCue,
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

interface CuePlayer {
  play(cue: Cue): void;
}

export interface LessonPageProps {
  state?: SessionState;
  queue?: EventQueue;
  now?: () => number;
  cuePlayer?: CuePlayer;
  corpus?: Corpus;
}

const STAGE_TITLES = ["热身", "学新招", "巩固挑战"] as const;
const defaultCuePlayer = createBrowserCuePlayer();

function completedStageTitle(
  nextIndex: number,
): (typeof STAGE_TITLES)[number] | undefined {
  if (nextIndex === 5) return "热身";
  if (nextIndex === 10) return "学新招";
  if (nextIndex === 15) return "巩固挑战";
  return undefined;
}

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

export function LessonPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
  cuePlayer = defaultCuePlayer,
  corpus: corpusOverride,
}: LessonPageProps) {
  const runtime = useRuntimeContent();
  const corpus = corpusOverride ?? runtime.corpus;
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
    if (shouldRedirect) navigate("/home");
  }, [shouldRedirect]);

  useEffect(() => {
    if (questionKey === null) {
      attemptTrackerRef.current.clear();
    }
  }, [questionKey]);

  if (active === null || shouldRedirect) return null;

  if (active.pendingStageCompletion !== undefined) {
    const stageTitle = active.pendingStageCompletion;
    return (
      <PageShell title="阶段奖励">
        <Card>
          <div role="dialog" aria-modal="true">
            <div
              style={{
                marginBottom: tokens.space[3],
                fontSize: tokens.fontSize.lg,
                fontWeight: 800,
              }}
            >
              {stageTitle} · 阶段完成
            </div>
            <div style={{ marginBottom: tokens.space[4] }}>
              做得好，本组任务已经完成！
            </div>
            <PrimaryButton
              onClick={() => {
                const {
                  pendingStageCompletion: _pending,
                  ...withoutPending
                } = active;
                state.setActiveDaily(withoutPending);
                navigate("/home");
              }}
            >
              回到任务路线
            </PrimaryButton>
          </div>
        </Card>
      </PageShell>
    );
  }

  const step = steps[active.currentIndex];
  if (step === undefined) return null;
  const currentActive = active;
  const currentStep = step;

  function playCue(cue: QuestionCue): void {
    cuePlayer.play(cueFor(cue));
  }

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
          deviceId: "debug-web",
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

  return (
    <PageShell title="今日学习" variant="question">
      <QuestionProgressHeader
        title={STAGE_TITLES[currentStep.levelIndex] ?? "今日学习"}
        knowledgeTitle={`正在学习：${knowledgePointTitle(
          corpus,
          currentStep.kpId,
        )}`}
        current={currentStep.slotIndex + 1}
        total={5}
        overallCurrent={currentActive.currentIndex + 1}
        overallTotal={15}
        rewardHint="做完本组可得奖励"
        busy={busy}
        onBack={() => navigate("/home")}
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
    </PageShell>
  );
}
