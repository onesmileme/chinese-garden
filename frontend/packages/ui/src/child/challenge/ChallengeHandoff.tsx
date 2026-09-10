import { useEffect, useRef } from "react";
import { Button, Text, View } from "@tarojs/components";
import type { HandoffTarget } from "@cc/domain";
import { tokens } from "../../tokens";

export interface ChallengeHandoffProps {
  target: HandoffTarget;
  onContinue(): void;
}

export function ChallengeHandoff({
  target,
  onContinue,
}: ChallengeHandoffProps) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const startHold = () => {
    if (holdTimer.current !== null) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      onContinue();
    }, 2_000);
  };
  const browserHoldHandlers = {
    onMouseDown: startHold,
    onMouseUp: cancelHold,
    onMouseLeave: cancelHold,
  } as Record<string, unknown>;

  useEffect(() => cancelHold, []);

  if (target === "RESULT") {
    return (
      <View style={{ textAlign: "center", color: tokens.color.text }}>
        <Text
          style={{
            display: "block",
            fontSize: tokens.fontSize.lg,
            fontWeight: 800,
          }}
        >
          把设备交给小朋友，一起看结果
        </Text>
        <Button
          onClick={onContinue}
          style={{
            width: "100%",
            minHeight: 64,
            margin: `${tokens.space[4]}px 0 0`,
            border: 0,
            borderRadius: tokens.radius.md,
            background: tokens.color.current,
            color: tokens.color.text,
            fontWeight: 800,
          }}
        >
          一起看结果
        </Button>
      </View>
    );
  }

  return (
    <View style={{ textAlign: "center", color: tokens.color.text }}>
      <Text
        style={{
          display: "block",
          fontSize: tokens.fontSize.lg,
          fontWeight: 800,
        }}
      >
        小朋友回合完成
      </Text>
      <Text style={{ display: "block", marginTop: tokens.space[2] }}>
        成绩已经藏好啦
      </Text>
      <Button
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        {...browserHoldHandlers}
        style={{
          width: "100%",
          minHeight: 64,
          margin: `${tokens.space[4]}px 0 0`,
          border: 0,
          borderRadius: tokens.radius.md,
          background: tokens.color.current,
          color: tokens.color.text,
          fontWeight: 800,
          userSelect: "none",
        }}
      >
        家长长按 2 秒开始
      </Button>
    </View>
  );
}
