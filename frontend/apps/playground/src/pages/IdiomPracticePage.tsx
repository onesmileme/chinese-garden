import { useMemo, useRef, useState } from "react";
import {
  createFirstSubmissionTracker,
  EventQueue,
  recordAnswer,
  type IdGen,
} from "@cc/application";
import type { ContentLevel } from "@cc/content-schema";
import {
  createIdiomPracticeRound,
  IDIOM_ROUND_SIZE,
  type Corpus,
  type IdiomPracticeLevel,
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

const LEVELS: readonly {
  id: IdiomPracticeLevel;
  label: string;
}[] = [
  { id: "BEGINNER", label: "初级" },
  { id: "ADVANCED", label: "进阶" },
];

export interface IdiomPracticePageProps {
  corpus?: Corpus;
  abilityLevel?: ContentLevel;
  queue?: EventQueue;
  now?: () => number;
  idGen?: IdGen;
}

export function IdiomPracticePage({
  corpus,
  abilityLevel,
  queue = eventQueue,
  now = clock.now,
  idGen = defaultIdGen,
}: IdiomPracticePageProps = {}) {
  const runtime = useRuntimeContent();
  const resolvedCorpus = corpus ?? runtime.corpus;
  const resolvedLevel = abilityLevel ?? runtime.manifest.abilityLevel;
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) {
    sessionIdRef.current = idGen.ulid();
  }
  const sessionId = sessionIdRef.current;
  const [level, setLevel] = useState<IdiomPracticeLevel>("BEGINNER");
  const [round, setRound] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [clientSequence, setClientSequence] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const roundResult = useMemo(
    () => {
      try {
        return {
          questions: createIdiomPracticeRound(
            resolvedCorpus,
            level,
            `playground:${level}:${round}`,
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
    },
    [resolvedCorpus, resolvedLevel, level, round],
  );
  const questions = roundResult.questions;
  const question = questions?.[questionIndex];
  const flowQuestion = useMemo(
    () => (question === undefined ? undefined : { ...question }),
    [question, retryRevision],
  );
  const questionKey =
    question === undefined
      ? null
      : JSON.stringify([
          sessionId,
          clientSequence,
          question.seed,
        ]);
  const attemptTrackerRef = useRef(createFirstSubmissionTracker());

  function markQuestionReady(): void {
    if (questionKey === null) return;
    attemptTrackerRef.current.present(questionKey, now());
  }

  function reset(nextLevel: IdiomPracticeLevel = level): void {
    setLevel(nextLevel);
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
          clientSequence,
          contentVersion: runtime.manifest.version,
          ruleVersion: runtime.manifest.masteryRuleVersion,
          knowledgePointId: question.knowledgePointId,
          questionType: question.questionType,
          questionSeed: question.seed,
          questionIndex: clientSequence,
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
    setClientSequence((current) => current + 1);
    setQuestionIndex((current) => current + 1);
  }

  function playCue(cue: QuestionCue): void {
    cuePlayer.play(cueFor(cue));
  }

  if (roundResult.questions === null) {
    return (
      <PageShell title="成语世界">
        <Card>
          <div role="alert" style={{ textAlign: "center" }}>
            <h1>成语内容暂时不可用</h1>
            <p>{roundResult.error}</p>
          </div>
        </Card>
        <PrimaryButton onClick={() => navigate("/home")}>
          返回首页
        </PrimaryButton>
      </PageShell>
    );
  }

  if (questionIndex >= IDIOM_ROUND_SIZE) {
    return (
      <PageShell title="成语世界">
        <Card>
          <div style={{ textAlign: "center" }}>
            <h1>本轮完成</h1>
            <p>
              答对 {correctCount} / {IDIOM_ROUND_SIZE} 题
            </p>
          </div>
        </Card>
        <div
          style={{
            display: "grid",
            gap: tokens.space[3],
          }}
        >
          <PrimaryButton onClick={() => reset()}>再来一轮</PrimaryButton>
          <PrimaryButton onClick={() => navigate("/home")}>
            返回首页
          </PrimaryButton>
        </div>
      </PageShell>
    );
  }

  if (question === undefined) {
    throw new Error(`idiom question index out of range: ${questionIndex}`);
  }

  return (
    <PageShell title="成语世界" variant="question">
      <QuestionProgressHeader
        title="成语世界"
        knowledgeTitle={`本轮正确 ${correctCount} 题`}
        current={questionIndex + 1}
        total={IDIOM_ROUND_SIZE}
        busy={busy}
        onBack={() => navigate("/home")}
      />
      <div
        aria-label="练习难度"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: tokens.space[2],
          margin: `${tokens.space[3]}px 0`,
        }}
      >
        {LEVELS.map((option) => {
          const active = option.id === level;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) reset(option.id);
              }}
              style={{
                minHeight: tokens.control.optionMinHeight,
                border: `2px solid ${tokens.color.idiom}`,
                borderRadius: tokens.radius.md,
                background: active ? tokens.bg.bands[3] : tokens.bg.surface,
                color: tokens.color.text,
                fontSize: tokens.fontSize.md,
                fontWeight: 800,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
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
