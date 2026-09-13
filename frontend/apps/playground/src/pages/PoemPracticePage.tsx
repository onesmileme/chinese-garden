import { useMemo, useRef, useState } from "react";
import {
  createFirstSubmissionTracker,
  EventQueue,
  recordAnswer,
  type IdGen,
} from "@cc/application";
import type { ContentLevel } from "@cc/content-schema";
import {
  createMixedPoemRound,
  POEM_ROUND_SIZE,
  type Corpus,
} from "@cc/domain";
import {
  cueFor,
  QuestionFlow,
  QuestionProgressHeader,
  QuestionStage,
  tokens,
  type QuestionCue,
} from "@cc/ui";
import { Card, PageShell, PrimaryButton } from "../layout";
import { createBrowserCuePlayer } from "../mock/cue-player";
import { navigate } from "../router";
import { useRuntimeContent } from "../content/runtime";
import {
  clock,
  eventQueue,
  idGen as defaultIdGen,
} from "../store";

const cuePlayer = createBrowserCuePlayer();

export interface PoemPracticePageProps {
  corpus?: Corpus;
  abilityLevel?: ContentLevel;
  queue?: EventQueue;
  now?: () => number;
  idGen?: IdGen;
}

export function PoemPracticePage({
  corpus,
  abilityLevel,
  queue = eventQueue,
  now = clock.now,
  idGen = defaultIdGen,
}: PoemPracticePageProps = {}) {
  const runtime = useRuntimeContent();
  const resolvedCorpus = corpus ?? runtime.corpus;
  const resolvedLevel = abilityLevel ?? runtime.manifest.abilityLevel;
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = idGen.ulid();
  }
  const sessionId = sessionIdRef.current;
  const [round, setRound] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const roundResult = useMemo(() => {
    try {
      return {
        questions: createMixedPoemRound(
          resolvedCorpus,
          `playground:${round}`,
          resolvedLevel,
        ),
        error: null,
      };
    } catch (error) {
      return {
        questions: null,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }, [resolvedCorpus, resolvedLevel, round]);
  const questions = roundResult.questions;
  const question = questions?.[questionIndex];
  const flowQuestion = useMemo(
    () => (question === undefined ? undefined : { ...question }),
    [question, retryRevision],
  );
  const sessionQuestionIndex = round * POEM_ROUND_SIZE + questionIndex;
  const questionKey =
    question === undefined
      ? null
      : JSON.stringify([
          sessionId,
          sessionQuestionIndex,
          question.seed,
        ]);
  const attemptTrackerRef = useRef(createFirstSubmissionTracker());

  function markQuestionReady(): void {
    if (questionKey === null) return;
    attemptTrackerRef.current.present(questionKey, now());
  }

  function reset(): void {
    setRound((current) => current + 1);
    setQuestionIndex(0);
    setCorrectCount(0);
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

  async function answer(
    correct: boolean,
    chosenAnswer: string,
  ): Promise<void> {
    if (question === undefined || questionKey === null) return;
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
          context: "FREE_PRACTICE",
          participant: "CHILD",
          childProfileId: runtime.childProfileId,
          deviceId: "playground-browser",
          sessionId,
          clientSequence: sessionQuestionIndex,
          contentVersion: runtime.manifest.version,
          ruleVersion: runtime.manifest.masteryRuleVersion,
          knowledgePointId: question.knowledgePointId,
          questionType: question.questionType,
          questionSeed: question.seed,
          questionIndex: sessionQuestionIndex,
          submittedAnswer: attempt.chosenAnswer,
          correctAnswer: question.correctAnswer,
          ...(question.acceptedAnswers === undefined
            ? {}
            : { acceptedAnswers: question.acceptedAnswers }),
          firstAttempt: true,
          hintCount: 0,
          responseTimeMs: attempt.responseTimeMs,
        },
      );
    } catch (error) {
      if (attempt.correct) setRetryRevision((current) => current + 1);
      throw error;
    }
    if (attempt.correct) setCorrectCount((current) => current + 1);
    setQuestionIndex((current) => current + 1);
  }

  function playCue(cue: QuestionCue): void {
    cuePlayer.play(cueFor(cue));
  }

  if (roundResult.questions === null) {
    return (
      <PageShell title="诗词世界">
        <Card>
          <div role="alert" style={{ textAlign: "center" }}>
            <h1>诗词内容暂时不可用</h1>
            <p>{roundResult.error}</p>
          </div>
        </Card>
        <PrimaryButton onClick={() => navigate("/home")}>
          返回首页
        </PrimaryButton>
      </PageShell>
    );
  }

  if (questionIndex >= POEM_ROUND_SIZE) {
    return (
      <PageShell title="诗词世界">
        <Card>
          <div style={{ textAlign: "center" }}>
            <h1>本轮完成</h1>
            <p>
              答对 {correctCount} / {POEM_ROUND_SIZE} 题
            </p>
          </div>
        </Card>
        <div style={{ display: "grid", gap: tokens.space[3] }}>
          <PrimaryButton onClick={() => reset()}>再来一轮</PrimaryButton>
          <PrimaryButton onClick={() => navigate("/home")}>
            返回首页
          </PrimaryButton>
        </div>
      </PageShell>
    );
  }

  if (question === undefined) {
    throw new Error(`poem question index out of range: ${questionIndex}`);
  }

  return (
    <PageShell title="诗词世界" variant="question">
      <QuestionProgressHeader
        title="诗词世界"
        knowledgeTitle={`本轮正确 ${correctCount} 题`}
        current={questionIndex + 1}
        total={POEM_ROUND_SIZE}
        busy={busy}
        onBack={() => navigate("/home")}
      />
      <QuestionStage>
        <QuestionFlow
          question={flowQuestion ?? question}
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
