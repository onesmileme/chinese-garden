import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import type { LearningTaskVM } from "./learningJourneyModel";
import type { KnowledgeWorld } from "./knowledgeWorldModel";

export interface LearningTaskCardProps {
  task: LearningTaskVM;
  onPick?(): void;
}

const WORLD_LABELS: Record<KnowledgeWorld, string> = {
  poem: "古诗",
  idiom: "成语",
};

export function LearningTaskCard({
  task,
  onPick,
}: LearningTaskCardProps) {
  const current = task.status === "current";
  const done = task.status === "done";
  const locked = task.status === "locked";
  const enabled = current && onPick !== undefined;
  return (
    <Button
      {...(current ? { "aria-current": "step" } : {})}
      data-task-status={task.status}
      disabled={!enabled}
      {...(enabled ? { onClick: onPick } : {})}
      style={{
        width: "100%",
        margin: 0,
        padding: tokens.space[4],
        border: current
          ? `3px solid ${tokens.color.currentStrong}`
          : "3px solid transparent",
        borderRadius: tokens.radius.md,
        background: locked ? tokens.color.locked : tokens.bg.surface,
        color: tokens.color.text,
        textAlign: "left",
      }}
    >
      <View style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Text style={{ fontSize: 28 }}>{task.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ display: "block", fontWeight: 800 }}>
            {task.order}. {task.title}
          </Text>
          <Text style={{ display: "block", color: tokens.color.textSoft }}>
            {task.purpose}
          </Text>
        </View>
        <Text style={{ fontWeight: 800 }}>
          {done ? "已完成" : current ? "进行中" : "未解锁"}
        </Text>
        {done ? (
          <Text style={{ color: tokens.color.done, fontWeight: 800 }}>✓</Text>
        ) : null}
      </View>
      <View
        style={{
          display: "flex",
          gap: tokens.space[2],
          marginTop: tokens.space[3],
        }}
      >
        {task.worlds.map((world) => (
          <Text
            key={world}
            style={{
              padding: `${tokens.space[1]}px ${tokens.space[2]}px`,
              borderRadius: tokens.radius.sm,
              background: tokens.bg.bands[
                world === "poem" ? 1 : 2
              ],
            }}
          >
            {WORLD_LABELS[world]}
          </Text>
        ))}
        <Text style={{ marginLeft: "auto" }}>{task.knowledgeTitle}</Text>
      </View>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: tokens.space[3],
        }}
      >
        {Array.from({ length: task.total }, (_value, index) => (
          <View
            key={`${task.name}-${index}`}
            data-progress-dot="true"
            data-complete={index < task.completed ? "true" : "false"}
            style={{
              width: 15,
              height: 15,
              borderRadius: tokens.radius.md,
              background:
                index < task.completed
                  ? tokens.color.done
                  : index === task.completed && current
                    ? tokens.color.current
                    : tokens.color.locked,
            }}
          />
        ))}
        <Text style={{ marginLeft: "auto", fontWeight: 800 }}>
          {task.completed} / {task.total}
        </Text>
      </View>
    </Button>
  );
}
