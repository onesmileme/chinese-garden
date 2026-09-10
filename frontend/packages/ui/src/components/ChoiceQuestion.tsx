import React from "react";
import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";

export interface ChoiceQuestionProps {
  prompt: string;
  options: string[];
  /** 题面语义标签（如“上句”“成语”），古典留白式小标注，弱化童趣。 */
  promptLabel?: string;
  disabled?: boolean;
  onSelect(value: string): void;
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
          borderRadius: tokens.radius.md,
          background: tokens.question.stage,
          textAlign: "center",
        }}
      >
        {promptLabel ? (
          <Text
            aria-label="题面标签"
            style={{
              marginBottom: tokens.space[2],
              paddingLeft: tokens.space[2],
              paddingRight: tokens.space[2],
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
          return (
            <Button
              key={`${index}:${option}`}
              disabled={disabled}
              onClick={() => onSelect(option)}
              style={{
                boxSizing: "border-box",
                minWidth: 0,
                minHeight: tokens.control.choiceMinHeight,
                margin: 0,
                padding: tokens.space[3],
                border: `2px solid ${border}`,
                borderRadius: tokens.radius.md,
                background: tokens.bg.surface,
                boxShadow: `0 4px 0 ${border}`,
                color: tokens.color.text,
                fontSize: tokens.fontSize.md,
                fontWeight: 800,
                letterSpacing: 0,
                overflowWrap: "anywhere",
              }}
            >
              {option}
            </Button>
          );
        })}
      </View>
    </View>
  );
}
