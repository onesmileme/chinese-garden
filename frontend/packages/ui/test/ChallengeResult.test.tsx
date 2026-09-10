import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ChallengeResultDetails } from "@cc/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeResult } from "../src/child/challenge/ChallengeResult";

afterEach(cleanup);

function details(
  overrides: Partial<ChallengeResultDetails> = {},
): ChallengeResultDetails {
  return {
    winner: "CHILD",
    mode: "FIXED_RACE",
    playedAt: 100,
    child: { correctCount: 8, answeredCount: 10, activeElapsedMs: 42_100 },
    parent: { correctCount: 6, answeredCount: 10, activeElapsedMs: 51_200 },
    replay: { mode: "FIXED_RACE", tier: "STANDARD" },
    ...overrides,
  };
}

describe("ChallengeResult", () => {
  it.each([
    ["CHILD", "小朋友赢啦！"],
    ["PARENT", "家长赢得这一局"],
    ["DRAW", "并列冠军"],
  ] as const)("renders %s result copy", (winner, headline) => {
    render(
      <ChallengeResult
        details={details({ winner })}
        onReplay={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText(headline)).toBeTruthy();
  });

  it("shows counts and active times for a fixed race", () => {
    render(
      <ChallengeResult
        details={details()}
        onReplay={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText("8 题 · 42.1 秒")).toBeTruthy();
    expect(screen.getByText("6 题 · 51.2 秒")).toBeTruthy();
  });

  it("shows only correct counts for timed mode", () => {
    render(
      <ChallengeResult
        details={details({
          mode: "TIMED",
          replay: { mode: "TIMED", tier: "EXPERT" },
        })}
        onReplay={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText("8 题")).toBeTruthy();
    expect(screen.getByText("6 题")).toBeTruthy();
    expect(screen.queryByText(/42\.1 秒/)).toBeNull();
  });

  it("keeps replay and exit as separate actions", () => {
    const onReplay = vi.fn();
    const onExit = vi.fn();
    render(
      <ChallengeResult
        details={details()}
        onReplay={onReplay}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByText("再来一局"));
    fireEvent.click(screen.getByText("回到学习路线"));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
