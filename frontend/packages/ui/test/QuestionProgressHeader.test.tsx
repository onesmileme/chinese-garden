import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionProgressHeader } from "../src";

afterEach(cleanup);

describe("QuestionProgressHeader", () => {
  it("shows clamped daily progress, reward hint, and a 44px back action", () => {
    const onBack = vi.fn();
    render(
      <QuestionProgressHeader
        title="热身"
        knowledgeTitle="正在学习：天空"
        current={8}
        total={5}
        overallCurrent={5}
        overallTotal={15}
        rewardHint="做完本组可得奖励"
        onBack={onBack}
      />,
    );

    expect(screen.getByText("热身 · 正在学习：天空")).toBeTruthy();
    expect(screen.getByText("5 / 5")).toBeTruthy();
    expect(
      screen.getByText("★ 今日 5 / 15 · 做完本组可得奖励"),
    ).toBeTruthy();
    expect(
      document
        .querySelector('[data-progress-fill="true"]')
        ?.getAttribute("style"),
    ).toContain("width: 100%");

    const back = screen.getByRole("button", {
      name: "返回学习路线",
    }) as HTMLButtonElement;
    expect(back.style.width).toBe("44px");
    expect(back.style.height).toBe("44px");
    expect(back.style.borderRadius).toBe("50%");
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits overall progress in assessment mode", () => {
    render(
      <QuestionProgressHeader
        title="能力探索"
        knowledgeTitle="正在了解：月亮"
        current={2}
        total={5}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("能力探索 · 正在了解：月亮")).toBeTruthy();
    expect(screen.queryByText(/★ 今日/)).toBeNull();
  });

  it("shows overall progress without reward punctuation when no hint exists", () => {
    render(
      <QuestionProgressHeader
        title="热身"
        knowledgeTitle="正在学习：天空"
        current={-2}
        total={5}
        overallCurrent={1}
        overallTotal={15}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("0 / 5")).toBeTruthy();
    const overall = screen.getByText("★ 今日 1 / 15");
    expect(overall.textContent).not.toContain("·");
    expect(
      (document.querySelector('[data-progress-fill="true"]') as HTMLElement)
        .style.width,
    ).toBe("0%");
  });

  it("uses zero group progress when total is not positive", () => {
    render(
      <QuestionProgressHeader
        title="能力探索"
        knowledgeTitle="准备开始"
        current={1}
        total={0}
        onBack={() => {}}
      />,
    );

    expect(
      (document.querySelector('[data-progress-fill="true"]') as HTMLElement)
        .style.width,
    ).toBe("0%");
    expect(screen.getByText("0 / 0")).toBeTruthy();
  });

  it("disables back navigation while busy", () => {
    const onBack = vi.fn();
    render(
      <QuestionProgressHeader
        title="能力探索"
        knowledgeTitle="正在保存"
        current={3}
        total={5}
        busy
        onBack={onBack}
      />,
    );

    const back = screen.getByLabelText(
      "返回学习路线",
    ) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    fireEvent.click(back);
    expect(onBack).not.toHaveBeenCalled();
  });
});
