import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  challengeSourceFromPlan,
  contentSelectionOf,
  describeKnowledgePoint,
  knowledgePointDifficulty,
  knowledgePointTitle,
  materializeDailyQuestions,
  startDaily,
  type ActiveDailySession,
  type ContentSelection,
} from "@cc/application";
import {
  createLeveledDailyPlanInput,
  generateDailyPlan,
  availableChallengeDimensions,
  type Corpus,
} from "@cc/domain";
import {
  buildKnowledgeWorldModel,
  buildLearningJourneyModel,
  ChallengeEntry,
  KnowledgeWorldOverview,
  LearningJourney,
  tokens,
  worldForQuestionType,
} from "@cc/ui";
import { ParentGate } from "../components/ParentGate";
import { Card, PageShell } from "../layout";
import { navigate } from "../router";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../session-state";
import { clock, idGen } from "../store";
import { useRuntimeContent } from "../content/runtime";

export interface HomePageProps {
  state?: SessionState;
}

const PRACTICE_WORLDS = [
  { id: "poem", title: "古诗", completed: 0, total: 0 },
  { id: "idiom", title: "成语", completed: 0, total: 0 },
] as const;

function PracticeEntry() {
  return (
    <KnowledgeWorldOverview
      worlds={PRACTICE_WORLDS}
      onPracticePoem={() => navigate("/poem-practice")}
      onPracticeIdiom={() => navigate("/idiom-practice")}
    />
  );
}

function useSessionSnapshot(state: SessionState): AppState {
  return useSyncExternalStore(
    state.subscribe,
    state.getState,
    state.getState,
  );
}

function createDailySnapshot(
  corpus: Corpus,
  contentSelection: ContentSelection,
  ruleVersion: string,
): ActiveDailySession {
  const { abilityLevel, version: contentVersion } = contentSelection;
  const plan = generateDailyPlan(
    createLeveledDailyPlanInput({
      corpus,
      abilityLevel,
      remediation: false,
      due: [],
      weak: [],
      mastered: [],
      seed: `daily:${contentVersion}`,
    }),
  );
  const session = startDaily({
    idGen,
    clock,
    plan,
    contentVersion,
    ruleVersion,
  });
  return {
    session,
    currentIndex: 0,
    firstAttemptOutcomes: [],
    contentVersion,
    contentSelection,
    ruleVersion,
    updatedAt: clock.now(),
  };
}

export function HomePage({ state = sessionState }: HomePageProps) {
  const runtime = useRuntimeContent();
  const corpus = runtime.corpus;
  const contentVersion = runtime.manifest.version;
  const ruleVersion = runtime.manifest.masteryRuleVersion;
  const abilityLevel = runtime.manifest.abilityLevel;
  const contentSelection = useMemo(
    () => contentSelectionOf(runtime),
    [runtime],
  );
  const app = useSessionSnapshot(state);
  const [showUpdateNotice] = useState(
    () => state.getState().dailyPlanUpdated,
  );

  useEffect(() => {
    const current = state.getState();
    if (
      current.activeDaily === null &&
      current.lastSettlement === null
    ) {
      state.setActiveDaily(
        createDailySnapshot(
          corpus,
          contentSelection,
          ruleVersion,
        ),
      );
    }
    state.consumeDailyPlanUpdated();
  }, [contentSelection, corpus, ruleVersion, state]);

  useEffect(() => {
    if (!app.activeDaily) return;
    const source = challengeSourceFromPlan(
      app.activeDaily.session.levels,
      (kpId) => knowledgePointDifficulty(corpus, kpId),
      contentVersion,
      clock.now(),
    );
    if (source) state.saveCurrentChallengeSource(source);
  }, [app.activeDaily?.session, contentVersion, corpus, state]);

  const challengeReady =
    app.challengeSource !== null &&
    app.challengeSource.contentVersion === contentVersion &&
    availableChallengeDimensions(
      app.challengeSource.childDifficulty,
      corpus,
      abilityLevel,
    ).length > 0;
  const challengeStatus = !app.assessmentCompleted
    ? "LOCKED"
    : app.activeChallenge
      ? "ACTIVE"
      : challengeReady
        ? "READY"
        : "UNAVAILABLE";

  function ChallengeCard() {
    return (
      <div style={{ marginTop: tokens.space[4] }}>
        <ChallengeEntry
          status={challengeStatus}
          onAction={() => navigate("/challenge")}
          {...(app.lastChallengeResult
            ? { lastWinner: app.lastChallengeResult.winner }
            : {})}
        />
      </div>
    );
  }

  const activeDaily = app.activeDaily;
  if (activeDaily === null && app.lastSettlement !== null) {
    return (
      <PageShell
        title="今日学习"
        topRight={<ParentGate onUnlock={() => navigate("/guardian")} />}
      >
        <Card>
          <div style={{ textAlign: "center" }}>
            <h1>今日任务已完成</h1>
            <p>今日进度 15 / 15</p>
            <p>获得 {app.lastSettlement.xpAwarded} XP</p>
            <p>
              首次正确率{" "}
              {Math.round(app.lastSettlement.firstCorrectRate * 100)}%
            </p>
          </div>
        </Card>
        <PracticeEntry />
        <ChallengeCard />
      </PageShell>
    );
  }

  if (activeDaily === null) {
    return (
      <PageShell
        title="今日学习"
        topRight={<ParentGate onUnlock={() => navigate("/guardian")} />}
      >
        <div>正在准备今日任务…</div>
        <PracticeEntry />
        <ChallengeCard />
      </PageShell>
    );
  }

  const steps = materializeDailyQuestions(
    activeDaily.session,
    corpus,
    (kpId) => describeKnowledgePoint(corpus, kpId),
  );
  const worlds = buildKnowledgeWorldModel(steps, activeDaily.currentIndex);
  const journey = buildLearningJourneyModel(
    activeDaily.session.levels,
    activeDaily.currentIndex,
    (kpId) => knowledgePointTitle(corpus, kpId),
    (level) => {
      const levelIndex = activeDaily.session.levels.indexOf(level);
      return steps
        .filter((step) => step.levelIndex === levelIndex)
        .map((step) => worldForQuestionType(step.question.questionType));
    },
  );
  const journeyForAssessment = app.assessmentCompleted
    ? journey
    : {
        ...journey,
        actionLabel: "先做能力探索 · 每轮 5 题",
      };

  function continueJourney(): void {
    if (!app.assessmentCompleted) {
      navigate("/assessment");
      return;
    }
    navigate(journey.allDone ? "/summary" : "/lesson");
  }

  return (
    <PageShell
      title="今日学习"
      topRight={<ParentGate onUnlock={() => navigate("/guardian")} />}
    >
      {showUpdateNotice ? (
        <div
          role="status"
          style={{
            marginBottom: tokens.space[3],
            padding: tokens.space[3],
            borderRadius: tokens.radius.md,
            background: tokens.bg.bands[1],
            color: tokens.color.text,
          }}
        >
          学习内容已更新，已为你准备新的今日任务
        </div>
      ) : null}
      <div
        style={{
          marginBottom: tokens.space[3],
          color: tokens.color.text,
          fontWeight: 800,
        }}
      >
        今日进度 {journey.completed} / {journey.total}
      </div>
      <LearningJourney
        model={journeyForAssessment}
        worlds={worlds}
        onContinue={continueJourney}
        onPracticePoem={() => navigate("/poem-practice")}
        onPracticeIdiom={() => navigate("/idiom-practice")}
      />
      <ChallengeCard />
    </PageShell>
  );
}
