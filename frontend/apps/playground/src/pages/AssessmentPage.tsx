import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CHECKPOINT_SIZE,
  EXTRA_SIZE,
  EventQueue,
  advanceAssessment,
  assessmentKnowledgePointIds,
  contentSelectionOf,
  createFirstSubmissionTracker,
  describeKnowledgePoint,
  knowledgePointTitle,
  materializeAssessmentQuestions,
  recordAnswer,
  type ActiveAssessmentSession,
  type ContentSelection,
} from "@cc/application";
import { initAssessment, type Corpus } from "@cc/domain";
import type { ContentLevel, KnowledgePointId } from "@cc/content-schema";
import {
  cueFor,
  QuestionFlow,
  QuestionProgressHeader,
  QuestionStage,
  type Cue,
  type QuestionCue,
} from "@cc/ui";
import { PageShell } from "../layout";
import {
  createBrowserCuePlayer,
} from "../mock/cue-player";
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

export interface AssessmentPageProps {
  state?: SessionState;
  queue?: EventQueue;
  now?: () => number;
  cuePlayer?: CuePlayer;
  corpus?: Corpus;
  abilityLevel?: ContentLevel;
}

interface AssessmentRunnerProps {
  snapshot: ActiveAssessmentSession;
  state: SessionState;
  queue: EventQueue;
  now(): number;
  cuePlayer: CuePlayer;
  childProfileId: string;
  corpus: Corpus;
  knowledgePointIds: readonly KnowledgePointId[];
  ruleVersion: string;
}

const defaultCuePlayer = createBrowserCuePlayer();

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

function createAssessmentSnapshot(
  now: number,
  contentSelection: ContentSelection,
): ActiveAssessmentSession {
  return {
    state: initAssessment(0),
    round: 0,
    questionIndex: 0,
    correctCount: 0,
    startedAt: now,
    contentVersion: contentSelection.version,
    contentSelection,
    updatedAt: now,
  };
}

function levelKnowledgePoint(
  snapshot: ActiveAssessmentSession,
  knowledgePointIds: readonly KnowledgePointId[],
) {
  const levelIndex = Math.min(
    Math.max(snapshot.state.currentLevelIndex, 0),
    knowledgePointIds.length - 1,
  );
  return knowledgePointIds[levelIndex]!;
}

function AssessmentRunner({
  snapshot,
  state,
  queue,
  now,
  cuePlayer,
  childProfileId,
  corpus,
  knowledgePointIds,
  ruleVersion,
}: AssessmentRunnerProps) {
  const [busy, setBusy] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const kpId = levelKnowledgePoint(snapshot, knowledgePointIds);
  const questions = useMemo(
    () =>
      materializeAssessmentQuestions(
        kpId,
        snapshot.round,
        corpus,
        (id) => describeKnowledgePoint(corpus, id),
      ),
    [corpus, kpId, snapshot.round],
  );
  const question = questions[snapshot.questionIndex];
  const flowQuestion = useMemo(
    () => (question === undefined ? undefined : { ...question }),
    [question, retryRevision],
  );
  if (question === undefined) {
    throw new Error(
      `assessment question index out of range: ${snapshot.questionIndex}`,
    );
  }
  const activeQuestion = question;
  const sessionId = `assessment:${snapshot.startedAt}`;
  const clientSequence =
    snapshot.state.scoredQuestions + snapshot.questionIndex;
  const questionKey = JSON.stringify([
    sessionId,
    clientSequence,
    activeQuestion.seed,
  ]);
  const attemptTrackerRef = useRef(createFirstSubmissionTracker());

  function markQuestionReady(): void {
    attemptTrackerRef.current.present(questionKey, now());
  }

  const inExtraBlock = snapshot.questionIndex >= CHECKPOINT_SIZE;
  const current = inExtraBlock
    ? snapshot.questionIndex - CHECKPOINT_SIZE + 1
    : snapshot.questionIndex + 1;
  const total = inExtraBlock ? EXTRA_SIZE : CHECKPOINT_SIZE;

  function freezeFirstAttempt(
    chosenAnswer: string,
    correct: boolean,
  ): void {
    attemptTrackerRef.current.freeze(
      questionKey,
      chosenAnswer,
      correct,
      now(),
    );
  }

  async function answer(correct: boolean, chosenAnswer: string): Promise<void> {
    const attempt =
      attemptTrackerRef.current.get(questionKey) ??
      attemptTrackerRef.current.freeze(
        questionKey,
        chosenAnswer,
        correct,
        now(),
      );
    try {
      await recordAnswer(
        { queue, clock: { now: () => attempt.occurredAt } },
        {
          context: "ASSESSMENT",
          participant: "CHILD",
          childProfileId,
          deviceId: "playground-browser",
          sessionId,
          clientSequence,
          contentVersion: snapshot.contentVersion,
          ruleVersion,
          knowledgePointId: kpId,
          questionType: activeQuestion.questionType,
          questionSeed: activeQuestion.seed,
          questionIndex: clientSequence,
          submittedAnswer: attempt.chosenAnswer,
          correctAnswer: activeQuestion.correctAnswer,
          ...(activeQuestion.acceptedAnswers === undefined
            ? {}
            : { acceptedAnswers: activeQuestion.acceptedAnswers }),
          firstAttempt: true,
          hintCount: 0,
          responseTimeMs: attempt.responseTimeMs,
        },
      );
    } catch (error) {
      if (attempt.correct) setRetryRevision((current) => current + 1);
      throw error;
    }
    state.setActiveAssessment(
      advanceAssessment(snapshot, attempt.correct, attempt.submittedAt),
    );
  }

  function playCue(cue: QuestionCue): void {
    cuePlayer.play(cueFor(cue));
  }

  return (
    <PageShell title="能力探索" variant="question">
      <QuestionProgressHeader
        title="能力探索"
        knowledgeTitle={knowledgePointTitle(corpus, kpId)}
        current={current}
        total={total}
        busy={busy}
        onBack={() => navigate("/home")}
      />
      <QuestionStage>
        <QuestionFlow
          question={flowQuestion ?? activeQuestion}
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

export function AssessmentPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
  cuePlayer = defaultCuePlayer,
  corpus: corpusOverride,
  abilityLevel: abilityLevelOverride,
}: AssessmentPageProps) {
  const runtime = useRuntimeContent();
  const corpus = corpusOverride ?? runtime.corpus;
  const abilityLevel =
    abilityLevelOverride ?? runtime.manifest.abilityLevel;
  const ruleVersion = runtime.manifest.masteryRuleVersion;
  const childProfileId = runtime.childProfileId;
  const contentSelection = useMemo(
    () => contentSelectionOf(runtime),
    [runtime],
  );
  const knowledgePointIds = useMemo(
    () => assessmentKnowledgePointIds(corpus, abilityLevel),
    [abilityLevel, corpus],
  );
  const app = useSessionSnapshot(state);

  useEffect(() => {
    const current = state.getState();
    if (current.assessmentCompleted) {
      navigate("/home");
      return;
    }
    if (current.activeAssessment === null) {
      const startedAt = now();
      state.setActiveAssessment(
        createAssessmentSnapshot(startedAt, contentSelection),
      );
    }
  }, [contentSelection, now, state]);

  useEffect(() => {
    const current = state.getState();
    if (
      !current.assessmentCompleted &&
      current.activeAssessment?.state.finished
    ) {
      state.completeAssessment();
    }
    if (state.getState().assessmentCompleted) navigate("/home");
  }, [app.activeAssessment, app.assessmentCompleted, state]);

  if (app.assessmentCompleted) return null;
  if (app.activeAssessment === null) {
    return (
      <PageShell title="能力探索">
        <div>正在准备能力探索…</div>
      </PageShell>
    );
  }
  if (app.activeAssessment.state.finished) {
    return (
      <PageShell title="能力探索">
        <div role="status">正在保存探索结果…</div>
      </PageShell>
    );
  }

  return (
    <AssessmentRunner
      snapshot={app.activeAssessment}
      state={state}
      queue={queue}
      now={now}
      cuePlayer={cuePlayer}
      childProfileId={childProfileId}
      corpus={corpus}
      knowledgePointIds={knowledgePointIds}
      ruleVersion={ruleVersion}
    />
  );
}
