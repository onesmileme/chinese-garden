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

// 世界标签的糖果色底与字色：古诗暖杏、成语薄荷
const WORLD_TAG: Record<KnowledgeWorld, { bg: string; text: string }> = {
  poem: { bg: "#fff3d6", text: "#a26715" },
  idiom: { bg: "#e1f3ee", text: "#1d7e63" },
};

export function LearningTaskCard({
  task,
  onPick,
}: LearningTaskCardProps) {
  const current = task.status === "current";
  const done = task.status === "done";
  const locked = task.status === "locked";
  const enabled = current && onPick !== undefined;
  const statusLabel = done ? "已完成" : current ? "进行中" : "未解锁";
  const statusColor = done
    ? tokens.color.done
    : current
      ? tokens.color.currentStrong
      : tokens.color.textSoft;
  const statusBg = done
    ? "#e6f6ee"
    : current
      ? "#fdf1dd"
      : "#eef2f0";
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
          ? `2px solid ${tokens.color.current}`
          : "2px solid rgba(234, 169, 60, 0.14)",
        borderRadius: tokens.radius.card,
        background: locked ? "#f1f4f2" : tokens.bg.surface,
        boxShadow: locked ? "none" : tokens.shadow.card,
        color: tokens.color.text,
        textAlign: "left",
      }}
    >
      <View
        style={{ display: "flex", alignItems: "flex-start", gap: tokens.space[3] }}
      >
        <Text
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: tokens.radius.md + 4,
            background: done ? tokens.gradient.warmIcon : "#fff6e6",
            fontSize: 24,
          }}
        >
          {task.icon}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ display: "block", fontSize: 17, fontWeight: 800 }}>
            {task.order}. {task.title}
          </Text>
          <Text
            style={{
              display: "block",
              marginTop: tokens.space[1],
              color: tokens.color.textSoft,
              fontSize: tokens.fontSize.sm,
            }}
          >
            {task.purpose}
          </Text>
        </View>
        <Text
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: `${tokens.space[1]}px ${tokens.space[2]}px`,
            borderRadius: tokens.radius.md,
            background: statusBg,
            color: statusColor,
            fontSize: tokens.fontSize.sm,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
          {done ? <Text style={{ color: tokens.color.done }}>✓</Text> : null}
        </Text>
      </View>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space[2],
          marginTop: tokens.space[3],
          paddingTop: tokens.space[2],
          borderTop: "1px solid #f1ece0",
        }}
      >
        {task.worlds.map((world) => (
          <Text
            key={world}
            style={{
              padding: `2px ${tokens.space[2]}px`,
              borderRadius: tokens.radius.sm + 2,
              background: WORLD_TAG[world].bg,
              color: WORLD_TAG[world].text,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {WORLD_LABELS[world]}
          </Text>
        ))}
        <Text
          style={{
            marginLeft: "auto",
            color: tokens.color.textSoft,
            fontSize: tokens.fontSize.sm,
            fontWeight: 600,
          }}
        >
          {task.knowledgeTitle}
        </Text>
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
              width: 13,
              height: 13,
              borderRadius: tokens.radius.pill,
              background:
                index < task.completed
                  ? tokens.color.done
                  : index === task.completed && current
                    ? tokens.color.current
                    : tokens.color.locked,
              boxShadow:
                index < task.completed
                  ? "0 0 0 3px rgba(47, 133, 90, 0.14)"
                  : "none",
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
