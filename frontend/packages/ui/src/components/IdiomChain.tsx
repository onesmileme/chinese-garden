import React, { useEffect, useRef, useState } from "react";
import type { GeneratedQuestion } from "@cc/domain";
import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import {
  assembleIdiom,
  pickIdiomChar,
  shouldSubmitIdiom,
  undoIdiomChar,
} from "../logic/idiom-chain-selection";

export interface IdiomChainProps {
  question: GeneratedQuestion;
  disabled?: boolean;
  onAnswer(chosenAnswer: string): void;
}

export function IdiomChain({
  question,
  disabled = false,
  onAnswer,
}: IdiomChainProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const submitted = useRef(false);
  const promptCharacters = Array.from(question.prompt);
  const lastCharacter = promptCharacters[promptCharacters.length - 1] ?? "";

  useEffect(() => {
    setPicked([]);
    submitted.current = false;
  }, [question]);

  function select(candidateIndex: number): void {
    const nextPicked = pickIdiomChar(picked, candidateIndex);
    setPicked(nextPicked);
    if (shouldSubmitIdiom(nextPicked, submitted.current)) {
      submitted.current = true;
      onAnswer(assembleIdiom(question.options, nextPicked));
    }
  }

  function undoLast(): void {
    setPicked((current) => undoIdiomChar(current));
  }

  return (
    <View>
      <View
        aria-label="接龙提示"
        style={{
          boxSizing: "border-box",
          padding: tokens.space[4],
          border: `2px solid ${tokens.question.stageBorder}`,
          borderRadius: tokens.radius.md,
          background: tokens.question.stage,
          textAlign: "center",
        }}
      >
        <Text
          style={{
            display: "block",
            color: tokens.color.text,
            fontSize: tokens.fontSize.lg,
            fontWeight: 800,
            overflowWrap: "anywhere",
          }}
        >
          {question.prompt}
        </Text>
        <Text
          style={{
            display: "block",
            marginTop: tokens.space[2],
            color: tokens.color.textSoft,
            fontSize: tokens.fontSize.md,
            fontWeight: 800,
            overflowWrap: "anywhere",
          }}
        >
          接「{lastCharacter}」音
        </Text>
      </View>
      <View
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: tokens.space[2],
          margin: `${tokens.space[4]}px 0`,
        }}
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Text
            key={index}
            aria-label={`答案位${index + 1}`}
            style={{
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 0,
              minHeight: tokens.control.optionMinHeight,
              border: `1px solid ${tokens.color.currentStrong}`,
              borderRadius: tokens.radius.md,
              background: tokens.bg.surface,
              color: tokens.color.text,
              fontSize: tokens.fontSize.lg,
              fontWeight: 800,
              overflowWrap: "anywhere",
            }}
          >
            {question.options[picked[index] ?? -1] ?? ""}
          </Text>
        ))}
      </View>
      <View
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: tokens.space[2],
        }}
      >
        {question.options.map((character, index) => {
          const selected = picked.includes(index);
          const border =
            tokens.question.optionBorders[
              index % tokens.question.optionBorders.length
            ]!;
          return (
            <Button
              key={`${index}:${character}`}
              aria-label={`${character}，候选${index + 1}`}
              disabled={disabled || submitted.current || selected}
              onClick={() => select(index)}
              style={{
                boxSizing: "border-box",
                minWidth: 0,
                minHeight: tokens.control.optionMinHeight,
                margin: 0,
                padding: tokens.space[2],
                border: `2px solid ${border}`,
                borderRadius: tokens.radius.md,
                background: selected ? tokens.color.locked : tokens.bg.surface,
                boxShadow: `0 3px 0 ${border}`,
                color: tokens.color.text,
                fontSize: tokens.fontSize.md,
                fontWeight: 800,
                overflowWrap: "anywhere",
              }}
            >
              {character}
            </Button>
          );
        })}
      </View>
      <Button
        aria-label="撤销"
        disabled={disabled || submitted.current || picked.length === 0}
        onClick={undoLast}
        style={{
          boxSizing: "border-box",
          width: "100%",
          minHeight: tokens.control.optionMinHeight,
          marginTop: tokens.space[3],
          border: `2px solid ${tokens.question.stageBorder}`,
          borderRadius: tokens.radius.md,
          background: tokens.question.stage,
          color: tokens.color.text,
          fontSize: tokens.fontSize.lg,
          fontWeight: 800,
        }}
      >
        ↶
      </Button>
    </View>
  );
}
