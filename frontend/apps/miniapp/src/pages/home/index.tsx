import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Text, View } from "@tarojs/components";
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
  availableChallengeDimensions,
  createLeveledDailyPlanInput,
  generateDailyPlan,
  type Corpus,
} from "@cc/domain";
import {
  InkBackground,
  ChallengeEntry,
  KnowledgeWorldOverview,
  LearningJourney,
  buildKnowledgeWorldModel,
  buildLearningJourneyModel,
  tokens,
  worldForQuestionType,
} from "@cc/ui";
import ParentGate from "../../components/ParentGate";
import { openPage, routes } from "../../platform/custom-navigation";
import {
  sessionState,
  type AppState,
  type SessionState,
} from "../../session-state";
import { clock, idGen } from "../../store";
import { useRuntimeContent } from "../../content/runtime";

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
      onPracticePoem={() => openPage(routes.poemPractice)}
      onPracticeIdiom={() => openPage(routes.idiomPractice)}
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
  const session = startDaily({
    idGen,
    clock,
    plan: generateDailyPlan(
      createLeveledDailyPlanInput({
        corpus,
        abilityLevel,
        remediation: false,
        due: [],
        weak: [],
        mastered: [],
        seed: `daily:${contentVersion}`,
      }),
    ),
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

export default function HomePage({
  state = sessionState,
}: HomePageProps) {
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
      <View style={{ marginTop: tokens.space[4] }}>
        <ChallengeEntry
          status={challengeStatus}
          onAction={() => openPage(routes.challenge)}
          {...(app.lastChallengeResult
            ? { lastWinner: app.lastChallengeResult.winner }
            : {})}
        />
      </View>
    );
  }

  if (app.activeDaily === null && app.lastSettlement !== null) {
    return (
      <InkBackground>
        <View style={styles.page}>
          <View style={styles.topBar}>
            <Text style={styles.title}>今日学习</Text>
            <ParentGate onUnlock={() => openPage(routes.guardian)} />
          </View>
          <View style={styles.completed}>
            <Text style={styles.completedTitle}>今日任务已完成</Text>
            <Text>今日进度 15 / 15</Text>
            <Text>获得 {app.lastSettlement.xpAwarded} XP</Text>
          </View>
          <PracticeEntry />
          <ChallengeCard />
        </View>
      </InkBackground>
    );
  }

  const active = app.activeDaily;
  if (active === null) {
    return (
      <InkBackground>
        <View style={styles.page}>
          <Text>正在准备今日任务…</Text>
          <PracticeEntry />
          <ChallengeCard />
        </View>
      </InkBackground>
    );
  }

  const steps = materializeDailyQuestions(
    active.session,
    corpus,
    (kpId) => describeKnowledgePoint(corpus, kpId),
  );
  const worlds = buildKnowledgeWorldModel(steps, active.currentIndex);
  const journey = buildLearningJourneyModel(
    active.session.levels,
    active.currentIndex,
    (kpId) => knowledgePointTitle(corpus, kpId),
    (level) => {
      const levelIndex = active.session.levels.indexOf(level);
      return steps
        .filter((step) => step.levelIndex === levelIndex)
        .map((step) => worldForQuestionType(step.question.questionType));
    },
  );
  const model = app.assessmentCompleted
    ? journey
    : {
        ...journey,
        actionLabel: "先做能力探索 · 每轮 5 题",
      };

  function continueJourney(): void {
    if (!app.assessmentCompleted) {
      openPage(routes.assessment);
      return;
    }
    openPage(journey.allDone ? routes.summary : routes.lesson);
  }

  return (
    <InkBackground>
      <View style={styles.page}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.title}>今日学习</Text>
            <Text style={styles.progress}>
              今日进度 {journey.completed} / {journey.total}
            </Text>
          </View>
          <ParentGate onUnlock={() => openPage(routes.guardian)} />
        </View>
        {showUpdateNotice ? (
          <View role="status" style={styles.notice}>
            <Text>今天的任务更新啦</Text>
          </View>
        ) : null}
        <LearningJourney
          model={model}
          worlds={worlds}
          onContinue={continueJourney}
          onPracticePoem={() => openPage(routes.poemPractice)}
          onPracticeIdiom={() => openPage(routes.idiomPractice)}
        />
        <ChallengeCard />
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
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space[3],
    marginBottom: tokens.space[4],
  },
  title: {
    display: "block",
    fontSize: tokens.fontSize.lg,
    fontWeight: 800,
  },
  progress: {
    display: "block",
    marginTop: tokens.space[1],
    color: tokens.color.textSoft,
  },
  notice: {
    marginBottom: tokens.space[3],
    padding: tokens.space[3],
    borderRadius: tokens.radius.md,
    background: tokens.bg.bands[1],
  },
  completed: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.space[3],
    padding: tokens.space[5],
    borderRadius: tokens.radius.md,
    background: tokens.color.surface,
  },
  completedTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: 800,
  },
} as const;
