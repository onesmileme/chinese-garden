import React, { useEffect, useRef, useState } from "react";
import type { GeneratedQuestion } from "@cc/domain";
import { Button, Text, View } from "@tarojs/components";
import { tokens } from "../tokens";
import {
  allBlanksFilled,
  characterInBlank,
  dropToBlank,
  initialPoemFillState,
  isCandidateUsed,
  removeFromBlank,
  reset,
  serializePoemFillState,
  undo,
  type PoemFillState,
} from "../logic/poem-fill";

export interface PoemFillProps {
  question: GeneratedQuestion;
  disabled?: boolean;
  onAnswer(chosenAnswer: string): void;
}

export function PoemFill({
  question,
  disabled = false,
  onAnswer,
}: PoemFillProps) {
  const displayLines = question.displayLines ?? [];
  const blanks = question.blanks ?? [];
  const candidates = question.candidates ?? [];
  const blankIndices = blanks.map((blank) => blank.index);

  const [state, setState] = useState<PoemFillState>(initialPoemFillState());
  const [selected, setSelected] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    setState(initialPoemFillState());
    setSelected(null);
    submitted.current = false;
  }, [question]);

  function onDropToBlank(candidateIndex: number, blankIndex: number): void {
    setState((current) => dropToBlank(current, candidateIndex, blankIndex));
  }

  function onRemoveFromBlank(blankIndex: number): void {
    setState((current) => removeFromBlank(current, blankIndex));
  }

  function tapCandidate(candidateIndex: number): void {
    setSelected(candidateIndex);
  }

  function tapBlank(blankIndex: number): void {
    if (characterInBlank(state, candidates, blankIndex) !== "") {
      onRemoveFromBlank(blankIndex);
      return;
    }
    if (selected === null) return;
    onDropToBlank(selected, blankIndex);
    setSelected(null);
  }

  function onSubmit(): void {
    submitted.current = true;
    setState((current) => ({ ...current }));
    onAnswer(serializePoemFillState(state, candidates));
  }

  function onUndo(): void {
    setState((current) => undo(current));
    setSelected(null);
  }

  function onReset(): void {
    setState((current) => reset(current));
    setSelected(null);
  }

  const canSubmit =
    !disabled &&
    !submitted.current &&
    allBlanksFilled(state, blankIndices);

  let blankPosition = 0;

  function renderDisplayLine(line: string, lineIndex: number): React.ReactNode {
    const parts = line.split("＿");

    return (
      <View
        key={`line-${lineIndex}`}
        aria-label={`诗句${lineIndex + 1}`}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          color: tokens.color.text,
          fontSize: tokens.fontSize.lg,
          lineHeight: 1.8,
          letterSpacing: 0,
        }}
      >
        {parts.map((part, partIndex) => {
          if (partIndex === parts.length - 1) {
            return <Text key={`text-${lineIndex}-${partIndex}`}>{part}</Text>;
          }

          const position = blankPosition;
          blankPosition += 1;
          const blank = blanks[position];
          if (blank === undefined) {
            return (
              <React.Fragment key={`text-${lineIndex}-${partIndex}`}>
                <Text>{part}</Text>
                <Text>＿</Text>
              </React.Fragment>
            );
          }

          const filledChar = characterInBlank(state, candidates, blank.index);
          return (
            <React.Fragment key={`blank-${lineIndex}-${partIndex}`}>
              <Text>{part}</Text>
              <Button
                aria-label={`空缺${position + 1}`}
                disabled={disabled || submitted.current}
                onClick={() => tapBlank(blank.index)}
                style={{
                  boxSizing: "border-box",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: tokens.control.optionMinHeight,
                  minWidth: tokens.control.optionMinHeight,
                  minHeight: tokens.control.optionMinHeight,
                  margin: `0 ${tokens.space[1]}px`,
                  padding: 0,
                  border:
                    filledChar === ""
                      ? `2px dashed ${tokens.question.stageBorder}`
                      : `2px solid ${tokens.color.currentStrong}`,
                  borderRadius: tokens.radius.sm,
                  background:
                    filledChar === ""
                      ? tokens.question.stage
                      : tokens.color.locked,
                  color: tokens.color.text,
                  fontSize: tokens.fontSize.lg,
                  letterSpacing: 0,
                }}
              >
                {filledChar === "" ? "＿" : filledChar}
              </Button>
            </React.Fragment>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <Text
        style={{
          display: "block",
          color: tokens.color.text,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        {question.prompt}
      </Text>
      <View style={{ margin: `${tokens.space[3]}px 0` }}>
        {displayLines.map(renderDisplayLine)}
      </View>
      <View
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: tokens.space[2],
        }}
      >
        {candidates.map((character, index) => {
          const used = isCandidateUsed(state, index);
          const border =
            tokens.question.optionBorders[
              index % tokens.question.optionBorders.length
            ]!;
          return (
            <Button
              key={`candidate-${index}`}
              aria-label={`${character}，候选${index + 1}`}
              disabled={disabled || submitted.current || used}
              data-selected={selected === index ? "true" : "false"}
              onClick={() => tapCandidate(index)}
              style={{
                boxSizing: "border-box",
                minWidth: 0,
                minHeight: tokens.control.optionMinHeight,
                margin: 0,
                padding: tokens.space[2],
                border: `2px solid ${border}`,
                borderRadius: tokens.radius.md,
                background:
                  selected === index ? tokens.color.current : tokens.bg.surface,
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
      <View
        style={{
          display: "flex",
          gap: tokens.space[2],
          marginTop: tokens.space[3],
        }}
      >
        <Button
          aria-label="撤销"
          disabled={
            disabled || submitted.current || state.history.length === 0
          }
          onClick={onUndo}
          style={{
            boxSizing: "border-box",
            flex: 1,
            minHeight: tokens.control.optionMinHeight,
            margin: 0,
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
        <Button
          aria-label="重置"
          disabled={
            disabled || submitted.current || state.history.length === 0
          }
          onClick={onReset}
          style={{
            boxSizing: "border-box",
            flex: 1,
            minHeight: tokens.control.optionMinHeight,
            margin: 0,
            border: `2px solid ${tokens.question.stageBorder}`,
            borderRadius: tokens.radius.md,
            background: tokens.question.stage,
            color: tokens.color.text,
            fontSize: tokens.fontSize.lg,
            fontWeight: 800,
          }}
        >
          ↺
        </Button>
      </View>
      <Button
        disabled={!canSubmit}
        onClick={onSubmit}
        style={{
          boxSizing: "border-box",
          width: "100%",
          minHeight: tokens.control.optionMinHeight,
          marginTop: tokens.space[3],
          border: `2px solid ${
            canSubmit ? tokens.color.currentStrong : tokens.color.locked
          }`,
          borderRadius: tokens.radius.md,
          background: canSubmit ? tokens.color.current : tokens.color.locked,
          color: tokens.color.text,
          fontSize: tokens.fontSize.md,
          fontWeight: 800,
        }}
      >
        确定
      </Button>
    </View>
  );
}
