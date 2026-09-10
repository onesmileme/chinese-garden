import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningTaskCard } from "../src";
import type { LearningTaskVM } from "../src/child/learningJourneyModel";

afterEach(cleanup);

const task = (overrides: Partial<LearningTaskVM> = {}): LearningTaskVM => ({
  name: "WAKEUP",
  order: 1,
  icon: "🌅",
  title: "热身",
  purpose: "复习认识的字，找回手感",
  worlds: ["poem", "idiom"],
  knowledgeTitle: "天空、月亮",
  completed: 2,
  total: 5,
  status: "current",
  ...overrides,
});

describe("LearningTaskCard", () => {
  it("renders and selects the current task with five progress points", () => {
    const onPick = vi.fn();
    render(<LearningTaskCard task={task()} onPick={onPick} />);

    expect(screen.getByText("1. 热身")).toBeTruthy();
    expect(screen.getByText("复习认识的字，找回手感")).toBeTruthy();
    expect(screen.getByText("古诗")).toBeTruthy();
    expect(screen.getByText("成语")).toBeTruthy();
    expect(screen.getByText("天空、月亮")).toBeTruthy();
    expect(screen.getByText("进行中")).toBeTruthy();
    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(
      document.querySelectorAll('[data-progress-dot="true"]'),
    ).toHaveLength(5);

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-current")).toBe("step");
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("keeps a locked task readable while disabling selection", () => {
    const onPick = vi.fn();
    render(
      <LearningTaskCard
        task={task({
          name: "NEW",
          order: 2,
          title: "学新招",
          worlds: ["poem"],
          completed: 0,
          status: "locked",
        })}
        onPick={onPick}
      />,
    );

    expect(screen.getByText("2. 学新招")).toBeTruthy();
    expect(screen.getByText("古诗")).toBeTruthy();
    expect(screen.getByText("未解锁")).toBeTruthy();
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("renders the idiom world label", () => {
    render(<LearningTaskCard task={task({ worlds: ["idiom"] })} />);

    expect(screen.getByText("成语")).toBeTruthy();
  });

  it("renders a completed task as done and disables selection", () => {
    const onPick = vi.fn();
    render(
      <LearningTaskCard
        task={task({ completed: 5, status: "done" })}
        onPick={onPick}
      />,
    );

    expect(screen.getByText("已完成")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
    expect(
      document.querySelectorAll(
        '[data-progress-dot="true"][data-complete="true"]',
      ),
    ).toHaveLength(5);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("disables a current task when no pick action is provided", () => {
    render(<LearningTaskCard task={task()} />);

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
