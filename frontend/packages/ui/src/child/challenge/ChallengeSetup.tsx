import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import type {
  ChallengeDimension,
  ChallengeMode,
  ParentTier,
} from "@cc/domain";
import { tokens } from "../../tokens";

type SetupStep = "DIMENSION" | "MODE" | "TIER" | "CONFIRM";

export interface ChallengeSetupSelection {
  dimension: ChallengeDimension;
  mode: ChallengeMode;
  tier: ParentTier;
}

export interface ChallengeSetupProps {
  /** 目标难度下可出题的维度（非空）；不可用维度会被禁用。 */
  availableDimensions: readonly ChallengeDimension[];
  initialDimension?: ChallengeDimension;
  initialMode?: ChallengeMode;
  initialTier?: ParentTier;
  onCancel?(): void;
  onStart(selection: ChallengeSetupSelection): void;
}

interface OptionButtonProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPick(): void;
}

function OptionButton({ label, selected, disabled, onPick }: OptionButtonProps) {
  return (
    <Button
      aria-pressed={selected}
      disabled={disabled ?? false}
      onClick={onPick}
      style={{
        width: "100%",
        minHeight: 64,
        margin: 0,
        border: selected
          ? `3px solid ${tokens.color.currentStrong}`
          : `2px solid ${tokens.color.locked}`,
        borderRadius: tokens.radius.md,
        background: disabled
          ? tokens.color.locked
          : selected
            ? tokens.color.current
            : tokens.color.surface,
        color: tokens.color.text,
        fontWeight: 800,
      }}
    >
      {label}
    </Button>
  );
}

const DIMENSION_LABEL: Record<ChallengeDimension, string> = {
  POEM: "诗词世界",
  IDIOM: "成语世界",
};

const MODE_SUMMARY: Record<ChallengeMode, string> = {
  TIMED: "限时答题 · 每人 60 秒",
  FIXED_RACE: "固定题量竞速 · 每人 10 题",
};

const TIER_SUMMARY: Record<ParentTier, string> = {
  STANDARD: "家长标准挑战 · L4 为主",
  EXPERT: "家长高手挑战 · L5 为主",
};

const DIMENSIONS: readonly ChallengeDimension[] = ["POEM", "IDIOM"];

export function ChallengeSetup({
  availableDimensions,
  initialDimension,
  initialMode = "TIMED",
  initialTier = "STANDARD",
  onCancel,
  onStart,
}: ChallengeSetupProps) {
  const firstAvailable = availableDimensions[0]!;
  const [step, setStep] = useState<SetupStep>("DIMENSION");
  const [dimension, setDimension] = useState<ChallengeDimension>(
    initialDimension && availableDimensions.includes(initialDimension)
      ? initialDimension
      : firstAvailable,
  );
  const [mode, setMode] = useState<ChallengeMode>(initialMode);
  const [tier, setTier] = useState<ParentTier>(initialTier);

  const back = () => {
    setStep(
      step === "CONFIRM" ? "TIER" : step === "TIER" ? "MODE" : "DIMENSION",
    );
  };

  const advance = () => {
    if (step === "DIMENSION") setStep("MODE");
    else if (step === "MODE") setStep("TIER");
    else setStep("CONFIRM");
  };

  const title =
    step === "DIMENSION"
      ? "选择挑战世界"
      : step === "MODE"
        ? "选择挑战规则"
        : step === "TIER"
          ? "选择家长难度"
          : "准备开始";

  return (
    <View style={{ color: tokens.color.text }}>
      <Text
        style={{
          display: "block",
          fontSize: tokens.fontSize.lg,
          fontWeight: 800,
        }}
      >
        {title}
      </Text>

      <View
        style={{
          display: "grid",
          gap: tokens.space[3],
          marginTop: tokens.space[4],
        }}
      >
        {step === "DIMENSION" ? (
          DIMENSIONS.map((option) => (
            <OptionButton
              key={option}
              label={DIMENSION_LABEL[option]}
              selected={dimension === option}
              disabled={!availableDimensions.includes(option)}
              onPick={() => setDimension(option)}
            />
          ))
        ) : step === "MODE" ? (
          <>
            <OptionButton
              label="限时答题"
              selected={mode === "TIMED"}
              onPick={() => setMode("TIMED")}
            />
            <OptionButton
              label="固定题量竞速"
              selected={mode === "FIXED_RACE"}
              onPick={() => setMode("FIXED_RACE")}
            />
          </>
        ) : step === "TIER" ? (
          <>
            <OptionButton
              label="标准挑战（L4 为主）"
              selected={tier === "STANDARD"}
              onPick={() => setTier("STANDARD")}
            />
            <OptionButton
              label="高手挑战（L5 为主）"
              selected={tier === "EXPERT"}
              onPick={() => setTier("EXPERT")}
            />
          </>
        ) : (
          <View
            style={{
              padding: tokens.space[4],
              borderRadius: tokens.radius.md,
              background: tokens.bg.surface,
            }}
          >
            <Text style={{ display: "block", fontWeight: 800 }}>
              {DIMENSION_LABEL[dimension]}
            </Text>
            <Text
              style={{
                display: "block",
                marginTop: tokens.space[2],
                fontWeight: 800,
              }}
            >
              {MODE_SUMMARY[mode]}
            </Text>
            <Text
              style={{
                display: "block",
                marginTop: tokens.space[2],
                fontWeight: 800,
              }}
            >
              {TIER_SUMMARY[tier]}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          display: "grid",
          gap: tokens.space[2],
          marginTop: tokens.space[4],
        }}
      >
        <Button
          onClick={
            step === "CONFIRM"
              ? () => onStart({ dimension, mode, tier })
              : advance
          }
          style={{
            width: "100%",
            minHeight: 64,
            margin: 0,
            border: 0,
            borderRadius: tokens.radius.md,
            background: tokens.color.current,
            color: tokens.color.text,
            fontWeight: 800,
          }}
        >
          {step === "CONFIRM" ? "小朋友先来" : "下一步"}
        </Button>
        {step === "DIMENSION" ? (
          onCancel ? (
            <Button
              onClick={onCancel}
              style={{
                minHeight: 64,
                margin: 0,
                border: 0,
                background: "transparent",
                color: tokens.color.text,
              }}
            >
              取消
            </Button>
          ) : null
        ) : (
          <Button
            onClick={back}
            style={{
              minHeight: 64,
              margin: 0,
              border: 0,
              background: "transparent",
              color: tokens.color.text,
            }}
          >
            返回上一步
          </Button>
        )}
      </View>
    </View>
  );
}
