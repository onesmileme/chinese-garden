import { Button, View } from "@tarojs/components";
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
          width: "100%",
          minHeight: 56,
          margin: 0,
          padding: `0 ${tokens.space[4]}px`,
          border: "none",
          borderRadius: tokens.radius.md,
          background: tokens.color.current,
          color: tokens.color.text,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        {model.actionLabel}
      </Button>
    </View>
  );
}
