import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeEntry } from "../src/child/challenge/ChallengeEntry";

afterEach(cleanup);

describe("ChallengeEntry", () => {
  it("renders locked, ready, active, and unavailable states", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ChallengeEntry status="LOCKED" onAction={onAction} />,
    );
    expect(screen.getByText("完成能力探索后解锁")).toBeTruthy();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);

    rerender(<ChallengeEntry status="READY" onAction={onAction} />);
    fireEvent.click(screen.getByText("发起挑战"));
    expect(onAction).toHaveBeenCalledTimes(1);

    rerender(<ChallengeEntry status="ACTIVE" onAction={onAction} />);
    expect(screen.getByText("继续亲子挑战")).toBeTruthy();

    rerender(<ChallengeEntry status="UNAVAILABLE" onAction={onAction} />);
    expect(screen.getByText("今天的挑战题还没准备好")).toBeTruthy();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it.each([
    ["CHILD", "上局：小朋友获胜"],
    ["PARENT", "上局：家长获胜"],
    ["DRAW", "上局：平局"],
  ] as const)("renders the compact %s result", (lastWinner, copy) => {
    render(
      <ChallengeEntry
        status="READY"
        lastWinner={lastWinner}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText(copy)).toBeTruthy();
  });
});
