import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Text, View } from "@tarojs/components";
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

export interface AssessmentPageProps {
  state?: SessionState;
  queue?: EventQueue;
  now?: () => number;
  corpus?: Corpus;
  abilityLevel?: ContentLevel;
}

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

function currentKp(
  snapshot: ActiveAssessmentSession,
  assessmentLevelKpIds: readonly KnowledgePointId[],
) {
  const index = Math.min(
    Math.max(snapshot.state.currentLevelIndex, 0),
    assessmentLevelKpIds.length - 1,
  );
  return assessmentLevelKpIds[index]!;
}

export default function AssessmentPage({
  state = sessionState,
  queue = eventQueue,
  now = clock.now,
  corpus: corpusOverride,
  abilityLevel,
}: AssessmentPageProps) {
  const runtime = useRuntimeContent();
  const corpus = corpusOverride ?? runtime.corpus;
  const resolvedAbilityLevel =
    abilityLevel ?? runtime.manifest.abilityLevel;
  const ruleVersion = runtime.manifest.masteryRuleVersion;
  const childProfileId = runtime.childProfileId;
  const contentSelection = useMemo(
    () => contentSelectionOf(runtime),
    [runtime],
  );
  const assessmentLevelKpIds = useMemo(
    () =>
      assessmentKnowledgePointIds(corpus, resolvedAbilityLevel),
    [corpus, resolvedAbilityLevel],
  );
  const app = useSessionSnapshot(state);
  const [busy, setBusy] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    const current = state.getState();
    if (current.assessmentCompleted) {
      redirectHome();
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
    if (state.getState().assessmentCompleted) redirectHome();
  }, [app.activeAssessment, app.assessmentCompleted, state]);

  const snapshot = app.activeAssessment;
  const kpId =
    snapshot === null
      ? null
      : currentKp(snapshot, assessmentLevelKpIds);
  const questions = useMemo(
    () =>
      snapshot === null || kpId === null
        ? []
        : materializeAssessmentQuestions(
            kpId,
            snapshot.round,
            corpus,
            (id) => describeKnowledgePoint(corpus, id),
          ),
    [corpus, kpId, snapshot?.round],
  );
  const question =
    snapshot === null ? undefined : questions[snapshot.questionIndex];
  const flowQuestion = useMemo(
    () => (question === undefined ? undefined : { ...question }),
    [question, retryRevision],
  );
  const sessionId =
    snapshot === null ? null : `assessment:${snapshot.startedAt}`;
  const clientSequence =
    snapshot === null
      ? null
      : snapshot.state.scoredQuestions + snapshot.questionIndex;
  const questionKey =
    snapshot === null ||
    snapshot.state.finished ||
    question === undefined ||
    sessionId === null ||
    clientSequence === null
      ? null
      : JSON.stringify([sessionId, clientSequence, question.seed]);
  const attemptTrackerRef = useRef(createFirstSubmissionTracker());

  useEffect(() => {
    if (questionKey === null) {
      attemptTrackerRef.current.clear();
    }
  }, [questionKey]);

  if (
    app.assessmentCompleted ||
    snapshot === null ||
    snapshot.state.finished
  ) {
    return (
      <InkBackground>
        <View style={styles.page}>
          <Text>
            {snapshot?.state.finished
              ? "正在保存探索结果…"
              : "正在准备能力探索…"}
          </Text>
        </View>
      </InkBackground>
    );
  }

  if (question === undefined || kpId === null) {
    redirectHome();
    return null;
  }
  const currentSnapshot = snapshot;
  const currentQuestion = question;
  const knowledgePointId = kpId;
  const inExtra = snapshot.questionIndex >= CHECKPOINT_SIZE;
  const current = inExtra
    ? snapshot.questionIndex - CHECKPOINT_SIZE + 1
    : snapshot.questionIndex + 1;
  const total = inExtra ? EXTRA_SIZE : CHECKPOINT_SIZE;

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
    const attempt =
      attemptTrackerRef.current.get(questionKey) ??
      attemptTrackerRef.current.freeze(
        questionKey,
        chosenAnswer,
        correct,
        now(),
      );
    const currentSessionId = `assessment:${currentSnapshot.startedAt}`;
    const currentSequence =
      currentSnapshot.state.scoredQuestions + currentSnapshot.questionIndex;
    try {
      await recordAnswer(
        { queue, clock: { now: () => attempt.occurredAt } },
        {
          context: "ASSESSMENT",
          participant: "CHILD",
          childProfileId,
          deviceId: "miniapp-device",
          sessionId: currentSessionId,
          clientSequence: currentSequence,
          contentVersion: currentSnapshot.contentVersion,
          ruleVersion,
          knowledgePointId,
          questionType: currentQuestion.questionType,
          questionSeed: currentQuestion.seed,
          questionIndex: currentSequence,
          submittedAnswer: attempt.chosenAnswer,
          correctAnswer: currentQuestion.correctAnswer,
          ...(currentQuestion.acceptedAnswers === undefined
            ? {}
            : { acceptedAnswers: currentQuestion.acceptedAnswers }),
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
      advanceAssessment(
        currentSnapshot,
        attempt.correct,
        attempt.submittedAt,
      ),
    );
  }

  function playCue(cue: QuestionCue): void {
    platform.cue(cueFor(cue));
  }

  return (
    <InkBackground>
      <View style={styles.page}>
        <QuestionProgressHeader
          title="能力探索"
          knowledgeTitle={knowledgePointTitle(corpus, knowledgePointId)}
          current={current}
          total={total}
          busy={busy}
          onBack={() => {
            void backToHome();
          }}
        />
        <QuestionStage>
          <QuestionFlow
            question={flowQuestion ?? currentQuestion}
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
} as const;
