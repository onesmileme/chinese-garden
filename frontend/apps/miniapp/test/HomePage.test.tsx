// @vitest-environment happy-dom
import Taro from "@tarojs/taro";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "../src/pages/home";
import { makeState } from "./page-fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("miniapp HomePage", () => {
  it("renders the three-stage journey and opens the lesson", () => {
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    render(<HomePage state={makeState()} />);

    expect(screen.getAllByText("诗词").length).toBeGreaterThan(0);
    expect(screen.getAllByText("古诗").length).toBeGreaterThan(0);
    expect(screen.getAllByText("成语").length).toBeGreaterThan(0);
    expect(screen.getByText("今日进度 0 / 15")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /开始热身/ }));
    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/lesson/index",
    });
  });

  it("routes first-time learners to assessment", () => {
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    render(
      <HomePage
        state={makeState({ assessmentCompleted: false })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "先做能力探索 · 每轮 5 题",
      }),
    );
    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/assessment/index",
    });
  });

  it("opens independent idiom practice without changing daily progress", () => {
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    const state = makeState();
    render(<HomePage state={state} />);

    fireEvent.click(
      screen.getByRole("button", { name: "成语 自由练习" }),
    );

    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/idiom-practice/index",
    });
    expect(state.getState().activeDaily?.currentIndex).toBe(0);
  });

  it("keeps idiom practice available after today's tasks are complete", () => {
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    const state = makeState({ daily: null });
    state.recordSettlement(
      {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
      "settled-today",
    );
    render(<HomePage state={state} />);

    expect(screen.getByText("今日任务已完成")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "成语 自由练习" }),
    );
    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/idiom-practice/index",
    });
  });

  it("keeps idiom practice available while daily tasks are loading", () => {
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    const state = makeState({ daily: null });
    state.setActiveDaily = vi.fn();
    render(<HomePage state={state} />);

    expect(screen.getByText("正在准备今日任务…")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "成语 自由练习" }),
    );
    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/idiom-practice/index",
    });
  });

  it("opens the guardian page only after a three-second hold", () => {
    vi.useFakeTimers();
    const navigateTo = vi.spyOn(Taro, "navigateTo");
    render(<HomePage state={makeState()} />);
    const gate = screen.getByRole("button", {
      name: "长按进入家长中心",
    });

    fireEvent.touchStart(gate);
    vi.advanceTimersByTime(2_999);
    expect(navigateTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(navigateTo).toHaveBeenCalledWith({
      url: "/pages/guardian/index",
    });
  });
});
