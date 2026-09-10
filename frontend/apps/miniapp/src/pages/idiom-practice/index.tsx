import { useMemo, useRef, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import {
  createFirstSubmissionTracker,
  EventQueue,
  recordAnswer,
  type IdGen,
} from "@cc/application";
import {
  createIdiomPracticeRound,
  IDIOM_ROUND_SIZE,
  type Corpus,
  type IdiomPracticeLevel,
} from "@cc/domain";
import {
  InkBackground,
  QuestionFlow,
  QuestionProgressHeader,
  QuestionStage,
  cueFor,
  tokens,
  type QuestionCue,
} from "@cc/ui";
import { platform } from "../../platform";
import { backToHome } from "../../platform/custom-navigation";
import { useRuntimeContent } from "../../content/runtime";
import {
  clock,
  eventQueue,
  idGen as defaultIdGen,
} from "../../store";
import type { ContentLevel } from "@cc/content-schema";

export interface IdiomPracticePageProps {
  corpus?: Corpus;
  abilityLevel?: ContentLevel;
  queue?: EventQueue;
  now?: () => number;
  idGen?: IdGen;
}

export default function IdiomPracticePage({
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
            `miniapp:${level}:${round}`,
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
  const question = roundResult.questions?.[questionIndex];
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

  function playCue(cue: QuestionCue): void {
    platform.cue(cueFor(cue));
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

  if (roundResult.questions === null) {
    return (
      <InkBackground>
        <View style={pageStyle}>
          <View role="alert" style={settlementStyle}>
            <Text style={settlementTitleStyle}>
              成语内容暂时不可用
            </Text>
            <Text>{roundResult.error}</Text>
          </View>
          <Button
            style={primaryButtonStyle}
            onClick={() => {
              void backToHome();
            }}
          >
            返回首页
          </Button>
        </View>
      </InkBackground>
    );
  }

  const questions = roundResult.questions;
  if (questionIndex >= IDIOM_ROUND_SIZE) {
    return (
      <InkBackground>
        <View style={pageStyle}>
          <View style={settlementStyle}>
            <Text style={settlementTitleStyle}>本轮完成</Text>
            <Text>
              答对 {correctCount} / {IDIOM_ROUND_SIZE} 题
            </Text>
          </View>
          <View style={settlementActionsStyle}>
            <Button style={primaryButtonStyle} onClick={() => reset()}>
              再来一轮
            </Button>
            <Button
              style={primaryButtonStyle}
              onClick={() => {
                void backToHome();
              }}
            >
              返回首页
            </Button>
          </View>
        </View>
      </InkBackground>
    );
  }

  if (question === undefined) {
    throw new Error(
      `idiom question index out of range: ${questionIndex}`,
    );
  }
  const currentQuestion = question;
  const currentSequence = clientSequence;

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
    try {
      await recordAnswer(
        { queue, clock: { now: () => attempt.occurredAt } },
        {
          context: "FREE_PRACTICE",
          participant: "CHILD",
          childProfileId: runtime.childProfileId,
          deviceId: "miniapp-device",
          sessionId,
          clientSequence: currentSequence,
          contentVersion: runtime.manifest.version,
          ruleVersion: runtime.manifest.masteryRuleVersion,
          knowledgePointId: currentQuestion.knowledgePointId,
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
    if (attempt.correct) setCorrectCount((current) => current + 1);
    setClientSequence((current) => current + 1);
    setQuestionIndex((current) => current + 1);
  }

  return (
    <InkBackground>
      <View style={pageStyle}>
        <QuestionProgressHeader
          title="成语世界"
          knowledgeTitle={`本轮正确 ${correctCount} 题`}
          current={questionIndex + 1}
          total={IDIOM_ROUND_SIZE}
          busy={busy}
          onBack={() => {
            void backToHome();
          }}
        />
        <View aria-label="练习难度" style={levelStyle}>
          <Button
            aria-pressed={level === "BEGINNER"}
            onClick={() => {
              if (level !== "BEGINNER") reset("BEGINNER");
            }}
            style={
              level === "BEGINNER" ? activeLevelStyle : levelButtonStyle
            }
          >
            初级
          </Button>
          <Button
            aria-pressed={level === "ADVANCED"}
            onClick={() => {
              if (level !== "ADVANCED") reset("ADVANCED");
            }}
            style={
              level === "ADVANCED" ? activeLevelStyle : levelButtonStyle
            }
          >
            进阶
          </Button>
        </View>
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
      </View>
    </InkBackground>
  );
}

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: tokens.space[4],
  color: tokens.color.text,
} as const;

const levelStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: tokens.space[2],
  margin: `${tokens.space[3]}px 0`,
} as const;

const levelButtonStyle = {
  minHeight: tokens.control.optionMinHeight,
  margin: 0,
  border: `2px solid ${tokens.color.idiom}`,
  borderRadius: tokens.radius.md,
  background: tokens.color.surface,
  color: tokens.color.text,
  fontSize: tokens.fontSize.md,
  fontWeight: 800,
} as const;

const activeLevelStyle = {
  ...levelButtonStyle,
  background: tokens.bg.bands[3],
} as const;

const settlementStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: tokens.space[3],
  padding: tokens.space[5],
  borderRadius: tokens.radius.md,
  background: tokens.color.surface,
} as const;

const settlementTitleStyle = {
  fontSize: tokens.fontSize.lg,
  fontWeight: 800,
} as const;

const settlementActionsStyle = {
  display: "grid",
  gap: tokens.space[3],
  marginTop: tokens.space[3],
} as const;

const primaryButtonStyle = {
  width: "100%",
  minHeight: tokens.control.optionMinHeight,
  margin: 0,
  border: "none",
  borderRadius: tokens.radius.md,
  background: tokens.color.current,
  color: tokens.color.text,
  fontWeight: 800,
} as const;
