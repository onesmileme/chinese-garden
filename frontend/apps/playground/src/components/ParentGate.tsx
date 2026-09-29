import { useCallback, useEffect, useRef, useState } from "react";
import { PARENT_GATE_HOLD_DURATION_MS } from "@cc/application";
import { tokens } from "@cc/ui";

const PROGRESS_INTERVAL_MS = 50;

export interface ParentGateProps {
  onUnlock(): void;
}

export function ParentGate({ onUnlock }: ParentGateProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer =
    useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number | null>(null);
  const onUnlockRef = useRef(onUnlock);
  const [progress, setProgress] = useState(0);
  onUnlockRef.current = onUnlock;

  const clearTimers = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (progressTimer.current !== null) {
      clearInterval(progressTimer.current);
    }
    timer.current = null;
    progressTimer.current = null;
    startedAt.current = null;
  }, []);

  const cancelHold = useCallback(() => {
    clearTimers();
    setProgress(0);
  }, [clearTimers]);

  function beginHold(): void {
    if (timer.current !== null) return;
    startedAt.current = Date.now();
    setProgress(0);
    timer.current = setTimeout(() => {
      if (progressTimer.current !== null) {
        clearInterval(progressTimer.current);
      }
      timer.current = null;
      progressTimer.current = null;
      startedAt.current = null;
      setProgress(100);
      onUnlockRef.current();
    }, PARENT_GATE_HOLD_DURATION_MS);
    progressTimer.current = setInterval(() => {
      if (startedAt.current === null) return;
      setProgress(
        Math.min(
          99,
          Math.floor(
            ((Date.now() - startedAt.current) /
              PARENT_GATE_HOLD_DURATION_MS) *
              100,
          ),
        ),
      );
    }, PROGRESS_INTERVAL_MS);
  }

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers],
  );

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
        position: "relative",
        width: tokens.control.backSize,
        height: tokens.control.backSize,
        border: "none",
        borderRadius: "50%",
        background: "transparent",
        color: tokens.color.textSoft,
        fontSize: tokens.fontSize.lg,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <span
        role="progressbar"
        aria-label="长按进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        style={{
          position: "absolute",
          inset: 2,
          borderRadius: "50%",
          background: `conic-gradient(${tokens.color.textSoft} ${progress}%, transparent ${progress}%)`,
          opacity: progress === 0 ? 0.25 : 0.8,
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          width: "100%",
          height: "100%",
        }}
      >
        ⚙
      </span>
    </button>
  );
}
