import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import type { KnowledgeWorld, KnowledgeWorldVM } from "./knowledgeWorldModel";

export interface KnowledgeWorldOverviewProps {
  worlds: readonly KnowledgeWorldVM[];
  onPracticePoem?(): void;
  onPracticeIdiom?(): void;
}

const WORLD_TAB: Record<KnowledgeWorld, (typeof tokens.tab)[KnowledgeWorld]> = {
  poem: tokens.tab.poem,
  idiom: tokens.tab.idiom,
};

const WORLD_BAND: Record<KnowledgeWorld, number> = {
  poem: 1,
  idiom: 2,
};

export function KnowledgeWorldOverview({
  worlds,
  onPracticePoem,
  onPracticeIdiom,
}: KnowledgeWorldOverviewProps) {
  const handlers: Record<KnowledgeWorld, (() => void) | undefined> = {
    poem: onPracticePoem,
    idiom: onPracticeIdiom,
  };

  return (
    <View
      aria-label="今日知识世界"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: tokens.space[3],
      }}
    >
      {worlds.map((world) => {
        const onPractice = handlers[world.id];
        const tab = WORLD_TAB[world.id];
        return onPractice ? (
          <Button
            key={world.id}
            aria-label={`${world.title} 自由练习`}
            onClick={onPractice}
            style={{
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: `1 1 calc(50% - ${tokens.space[3] / 2}px)`,
              minHeight: tokens.control.optionMinHeight,
              margin: 0,
              padding: tokens.space[3],
              border: `1px solid ${tab.border}`,
              borderRadius: tokens.radius.card,
              background: tab.bg,
              color: tab.text,
              textAlign: "center",
            }}
          >
            <Text style={{ display: "block", fontSize: 17, fontWeight: 800 }}>
              {world.title}
            </Text>
            <Text
              style={{
                display: "block",
                marginTop: tokens.space[1],
                color: tab.sub,
                fontSize: tokens.fontSize.sm,
                fontWeight: 700,
              }}
            >
              自由练习
            </Text>
          </Button>
        ) : (
          <View
            key={world.id}
            style={{
              boxSizing: "border-box",
              flex: `1 1 calc(50% - ${tokens.space[3] / 2}px)`,
              padding: tokens.space[3],
              borderRadius: tokens.radius.card,
              background: tokens.bg.bands[WORLD_BAND[world.id]],
              color: tokens.color.text,
              textAlign: "center",
            }}
          >
            <Text style={{ display: "block", fontWeight: 800 }}>
              {world.title}
            </Text>
            <Text style={{ display: "block", marginTop: tokens.space[1] }}>
              {world.completed} / {world.total}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
