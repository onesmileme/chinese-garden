import { useEffect, useRef } from "react";
import { Button } from "@tarojs/components";
import { tokens } from "@cc/ui";

const HOLD_DURATION_MS = 3_000;

export interface ParentGateProps {
  onUnlock(): void;
}

export default function ParentGate({ onUnlock }: ParentGateProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHold(): void {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }

  function beginHold(): void {
    cancelHold();
    timer.current = setTimeout(() => {
      timer.current = null;
      onUnlock();
    }, HOLD_DURATION_MS);
  }

  useEffect(() => cancelHold, []);

  return (
    <Button
      aria-label="长按进入家长中心"
      onTouchStart={beginHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      style={{
        width: tokens.control.backSize,
        height: tokens.control.backSize,
        padding: 0,
        border: "none",
        borderRadius: tokens.radius.md,
        background: "transparent",
        color: tokens.color.textSoft,
        fontSize: tokens.fontSize.lg,
      }}
    >
      ⚙
    </Button>
  );
}
