// @vitest-environment happy-dom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ParentGate from "../src/components/ParentGate";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("miniapp ParentGate", () => {
  it("unlocks only after a two-second touch hold", () => {
    vi.useFakeTimers();
    const onUnlock = vi.fn();
    render(<ParentGate onUnlock={onUnlock} />);
    const gate = screen.getByRole("button", {
      name: "长按进入家长中心",
    });

    fireEvent.touchStart(gate);
    act(() => vi.advanceTimersByTime(1_999));
    expect(onUnlock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("shows progress and resets it after touch cancellation", () => {
    vi.useFakeTimers();
    render(<ParentGate onUnlock={vi.fn()} />);
    const gate = screen.getByRole("button", {
      name: "长按进入家长中心",
    });
    const progress = screen.getByRole("progressbar");

    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.touchStart(gate);
    act(() => vi.advanceTimersByTime(1_000));
    expect(progress.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.touchCancel(gate);
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
  });

  it.each(["touchEnd", "touchCancel"] as const)(
    "cancels an unfinished hold on %s",
    (eventName) => {
      vi.useFakeTimers();
      const onUnlock = vi.fn();
      render(<ParentGate onUnlock={onUnlock} />);
      const gate = screen.getByRole("button", {
        name: "长按进入家长中心",
      });

      fireEvent.touchStart(gate);
      act(() => vi.advanceTimersByTime(1_000));
      fireEvent[eventName](gate);
      act(() => vi.advanceTimersByTime(2_000));

      expect(onUnlock).not.toHaveBeenCalled();
    },
  );

  it("clears an unfinished hold when unmounted", () => {
    vi.useFakeTimers();
    const onUnlock = vi.fn();
    const view = render(<ParentGate onUnlock={onUnlock} />);

    fireEvent.touchStart(
      screen.getByRole("button", { name: "长按进入家长中心" }),
    );
    view.unmount();
    act(() => vi.advanceTimersByTime(2_000));

    expect(onUnlock).not.toHaveBeenCalled();
  });
});
