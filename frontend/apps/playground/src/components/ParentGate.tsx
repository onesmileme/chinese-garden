import { useEffect, useRef } from "react";
import { tokens } from "@cc/ui";

const HOLD_DURATION_MS = 3_000;

export interface ParentGateProps {
  onUnlock(): void;
}

export function ParentGate({ onUnlock }: ParentGateProps) {
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
    <button
      type="button"
      aria-label="长按进入家长中心"
      onPointerDown={beginHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onMouseDown={beginHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={beginHold}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: tokens.control.backSize,
        height: tokens.control.backSize,
        border: "none",
        borderRadius: tokens.radius.md,
        background: "transparent",
        color: tokens.color.textSoft,
        fontSize: tokens.fontSize.lg,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      ⚙
    </button>
  );
}
