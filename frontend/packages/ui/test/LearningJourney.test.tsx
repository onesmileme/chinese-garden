import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearningJourney } from "../src";
import type { LearningJourneyVM } from "../src/child/learningJourneyModel";
import type { KnowledgeWorldVM } from "../src/child/knowledgeWorldModel";

afterEach(cleanup);

const worlds: KnowledgeWorldVM[] = [
  { id: "poem", title: "古诗", completed: 0, total: 5 },
  { id: "idiom", title: "成语", completed: 0, total: 0 },
];

const model: LearningJourneyVM = {
  completed: 2,
  total: 15,
  actionLabel: "继续热身 · 第 3 题",
  allDone: false,
  tasks: [
    {
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
    },
    {
      name: "NEW",
      order: 2,
      icon: "✨",
      title: "学新招",
      purpose: "学习新汉字，再放进词语或诗句里",
      worlds: ["poem"],
      knowledgeTitle: "天空",
      completed: 0,
      total: 5,
      status: "locked",
    },
    {
      name: "CONSOLIDATION",
      order: 3,
      icon: "💪",
      title: "巩固挑战",
      purpose: "混合练习，完成一句古诗",
      worlds: ["poem", "idiom"],
      knowledgeTitle: "静夜思",
      completed: 0,
      total: 5,
      status: "locked",
    },
  ],
};

describe("LearningJourney", () => {
  it("renders three worlds, three task cards, and one continuation CTA", () => {
    const onContinue = vi.fn();
    render(
      <LearningJourney
        model={model}
        worlds={worlds}
        onContinue={onContinue}
      />,
    );

    expect(screen.getAllByText("古诗").length).toBeGreaterThan(0);
    expect(screen.getAllByText("成语").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-task-status]")).toHaveLength(3);
    expect(
      document.querySelectorAll('[data-task-status="locked"]'),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll('[data-progress-dot="true"]'),
    ).toHaveLength(15);
    expect(
      screen.getAllByRole("button", { name: "继续热身 · 第 3 题" }),
    ).toHaveLength(1);

    fireEvent.click(
      document.querySelector(
        '[data-task-status="current"]',
      ) as HTMLButtonElement,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "继续热身 · 第 3 题" }),
    );
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it("passes idiom free practice to the host without changing daily totals", () => {
    const onPracticeIdiom = vi.fn();
    render(
      <LearningJourney
        model={model}
        worlds={worlds}
        onContinue={vi.fn()}
        onPracticeIdiom={onPracticeIdiom}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "成语 自由练习" }),
    );

    expect(onPracticeIdiom).toHaveBeenCalledTimes(1);
    expect(
      document.querySelectorAll('[data-progress-dot="true"]'),
    ).toHaveLength(15);
  });

  it("passes poem free practice to the host", () => {
    const onPracticePoem = vi.fn();
    render(
      <LearningJourney
        model={model}
        worlds={worlds}
        onContinue={vi.fn()}
        onPracticePoem={onPracticePoem}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "古诗 自由练习" }));

    expect(onPracticePoem).toHaveBeenCalledTimes(1);
  });
});
