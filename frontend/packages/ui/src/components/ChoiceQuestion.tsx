import React from "react";
import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";

export interface ChoiceQuestionProps {
  prompt: string;
  options: string[];
  /** 题面语义标签（如“上句”“成语”），印章式点题小徽章。 */
  promptLabel?: string;
  disabled?: boolean;
  onSelect(value: string): void;
}

// A/B/C/D 字母序号，超出四项后循环取字母。
function optionLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function ChoiceQuestion({
  prompt,
  options,
  promptLabel,
  disabled = false,
  onSelect,
}: ChoiceQuestionProps) {
  return (
    <View>
      <View
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          minHeight: 136,
          marginBottom: tokens.space[4],
          padding: tokens.space[4],
          borderRadius: tokens.radius.card,
          background: tokens.question.stage,
          textAlign: "center",
        }}
      >
        {promptLabel ? (
          <Text
            aria-label="题面标签"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: tokens.space[2],
              padding: `2px ${tokens.space[2]}px`,
              border: "1px solid #f0c0b8",
              borderRadius: tokens.radius.sm + 2,
              background: "#fdf1ef",
              color: tokens.color.vermilion,
              fontSize: tokens.fontSize.sm,
              fontWeight: 700,
              letterSpacing: 4,
            }}
          >
            {promptLabel}
          </Text>
        ) : null}
        <Text
          style={{
            color: tokens.color.text,
            fontSize: tokens.fontSize.display,
            fontWeight: 800,
            letterSpacing: 2,
            whiteSpace: "pre-line",
          }}
        >
          {prompt}
        </Text>
      </View>
      <View
        aria-label="答案选项"
        style={{
          display: "grid",
          gridTemplateColumns:
            options.length === 4 && options.every((item) => Array.from(item).length <= 8)
              ? "repeat(2, minmax(0, 1fr))"
              : "1fr",
          gap: tokens.space[3],
        }}
      >
        {options.map((option, index) => {
          const border =
            tokens.question.optionBorders[index % tokens.question.optionBorders.length]!;
          const badge =
            tokens.question.optionBadges[index % tokens.question.optionBadges.length]!;
          return (
            <Button
              key={`${index}:${option}`}
              aria-label={option}
              disabled={disabled}
              onClick={() => onSelect(option)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: tokens.space[3],
                boxSizing: "border-box",
                minWidth: 0,
                minHeight: tokens.control.choiceMinHeight,
                margin: 0,
                padding: tokens.space[3],
                border: `2px solid ${border}`,
                borderRadius: tokens.radius.card,
                background: tokens.bg.surface,
                boxShadow: `0 4px 0 ${border}`,
                color: tokens.color.text,
                fontSize: tokens.fontSize.md,
                fontWeight: 800,
                letterSpacing: 0,
                textAlign: "left",
                overflowWrap: "anywhere",
              }}
            >
              <Text
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: tokens.radius.pill,
                  background: badge.bg,
                  color: badge.text,
                  fontSize: tokens.fontSize.sm,
                  fontWeight: 800,
                }}
              >
                {optionLetter(index)}
              </Text>
              <Text style={{ flex: 1 }}>{option}</Text>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
