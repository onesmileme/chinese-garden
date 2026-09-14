import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import { KnowledgeWorldOverview } from "./KnowledgeWorldOverview";
import { LearningTaskCard } from "./LearningTaskCard";
import type { LearningJourneyVM } from "./learningJourneyModel";
import type { KnowledgeWorldVM } from "./knowledgeWorldModel";

export interface LearningJourneyProps {
  model: LearningJourneyVM;
  worlds: readonly KnowledgeWorldVM[];
  onContinue(): void;
  onPracticePoem?(): void;
  onPracticeIdiom?(): void;
}

export function LearningJourney({
  model,
  worlds,
  onContinue,
  onPracticePoem,
  onPracticeIdiom,
}: LearningJourneyProps) {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "column",
        gap: tokens.space[3],
      }}
    >
      <KnowledgeWorldOverview
        worlds={worlds}
        {...(onPracticePoem ? { onPracticePoem } : {})}
        {...(onPracticeIdiom ? { onPracticeIdiom } : {})}
      />
      {model.tasks.map((task) => (
        <LearningTaskCard
          key={task.name}
          task={task}
          {...(task.status === "current" ? { onPick: onContinue } : {})}
        />
      ))}
      <Button
        onClick={onContinue}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: tokens.space[2],
          width: "100%",
          minHeight: 56,
          margin: `${tokens.space[2]}px 0 0`,
          padding: `0 ${tokens.space[4]}px`,
          border: "none",
          borderRadius: tokens.radius.card,
          background: tokens.gradient.cta,
          boxShadow: tokens.shadow.kidBtn,
          color: tokens.bg.surface,
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        {model.allDone ? (
          <Text aria-hidden="true" style={{ fontSize: 20 }}>
            🎁
          </Text>
        ) : null}
        <Text>{model.actionLabel}</Text>
      </Button>
    </View>
  );
}
