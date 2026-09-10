import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeHandoff } from "../src/child/challenge/ChallengeHandoff";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ChallengeHandoff", () => {
  it("requires a complete two-second hold before parent starts", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    render(<ChallengeHandoff target="PARENT_TURN" onContinue={onContinue} />);

    fireEvent.touchStart(screen.getByText("家长长按 2 秒开始"));
    vi.advanceTimersByTime(1_999);
    expect(onContinue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("cancels incomplete touch, mouse, and unmounted holds", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    const { unmount } = render(
      <ChallengeHandoff target="PARENT_TURN" onContinue={onContinue} />,
    );
    const hold = screen.getByText("家长长按 2 秒开始");

    fireEvent.touchStart(hold);
    fireEvent.touchStart(hold);
    fireEvent.touchEnd(hold);
    vi.advanceTimersByTime(2_000);
    fireEvent.mouseDown(hold);
    fireEvent.mouseLeave(hold);
    vi.advanceTimersByTime(2_000);
    fireEvent.mouseDown(hold);
    fireEvent.mouseUp(hold);
    vi.advanceTimersByTime(2_000);
    fireEvent.touchStart(hold);
    fireEvent.touchCancel(hold);
    vi.advanceTimersByTime(2_000);
    fireEvent.touchStart(hold);
    unmount();
    vi.advanceTimersByTime(2_000);

    expect(onContinue).not.toHaveBeenCalled();
  });

  it("reveals results with a normal confirmation action", () => {
    const onContinue = vi.fn();
    render(<ChallengeHandoff target="RESULT" onContinue={onContinue} />);

    expect(screen.getByText("把设备交给小朋友，一起看结果")).toBeTruthy();
    fireEvent.click(screen.getByText("一起看结果"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
