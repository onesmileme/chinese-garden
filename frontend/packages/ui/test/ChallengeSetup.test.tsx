import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeSetup } from "../src/child/challenge/ChallengeSetup";

afterEach(cleanup);

function action(label: string): HTMLButtonElement {
  return screen.getByText(label).closest("button") as HTMLButtonElement;
}

describe("ChallengeSetup", () => {
  it("uses timed and standard defaults through all four steps", () => {
    const onStart = vi.fn();
    render(
      <ChallengeSetup
        availableDimensions={["POEM", "IDIOM"]}
        onStart={onStart}
      />,
    );

    expect(screen.getByText("选择挑战世界")).toBeTruthy();
    expect(action("诗词世界").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("下一步"));
    expect(action("限时答题").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("下一步"));
    expect(screen.getByText("标准挑战（L4 为主）")).toBeTruthy();
    expect(screen.getByText("高手挑战（L5 为主）")).toBeTruthy();
    fireEvent.click(screen.getByText("下一步"));
    expect(screen.getByText("诗词世界")).toBeTruthy();
    expect(screen.getByText("限时答题 · 每人 60 秒")).toBeTruthy();
    expect(screen.getByText("家长标准挑战 · L4 为主")).toBeTruthy();
    expect(screen.queryByText(/难度 \+[23]/)).toBeNull();
    fireEvent.click(screen.getByText("小朋友先来"));

    expect(onStart).toHaveBeenCalledWith({
      dimension: "POEM",
      mode: "TIMED",
      tier: "STANDARD",
    });
  });

  it("allows fixed race, expert tier, dimension switch, and back navigation", () => {
    const onStart = vi.fn();
    render(
      <ChallengeSetup
        availableDimensions={["POEM", "IDIOM"]}
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByText("成语世界"));
    fireEvent.click(screen.getByText("下一步"));
    fireEvent.click(screen.getByText("固定题量竞速"));
    fireEvent.click(screen.getByText("限时答题"));
    fireEvent.click(screen.getByText("固定题量竞速"));
    fireEvent.click(screen.getByText("下一步"));
    fireEvent.click(screen.getByText("高手挑战（L5 为主）"));
    fireEvent.click(screen.getByText("标准挑战（L4 为主）"));
    fireEvent.click(screen.getByText("高手挑战（L5 为主）"));
    fireEvent.click(screen.getByText("返回上一步"));
    expect(action("固定题量竞速").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("返回上一步"));
    expect(screen.getByText("选择挑战世界")).toBeTruthy();
    fireEvent.click(screen.getByText("下一步"));
    fireEvent.click(screen.getByText("下一步"));
    fireEvent.click(screen.getByText("高手挑战（L5 为主）"));
    fireEvent.click(screen.getByText("下一步"));
    expect(screen.getByText("准备开始")).toBeTruthy();
    fireEvent.click(screen.getByText("返回上一步"));
    expect(screen.getByText("选择家长难度")).toBeTruthy();
    fireEvent.click(screen.getByText("下一步"));
    expect(screen.getByText("成语世界")).toBeTruthy();
    expect(screen.getByText("固定题量竞速 · 每人 10 题")).toBeTruthy();
    expect(screen.getByText("家长高手挑战 · L5 为主")).toBeTruthy();
    expect(screen.queryByText(/难度 \+[23]/)).toBeNull();
    fireEvent.click(screen.getByText("小朋友先来"));

    expect(onStart).toHaveBeenCalledWith({
      dimension: "IDIOM",
      mode: "FIXED_RACE",
      tier: "EXPERT",
    });
  });

  it("disables unavailable dimensions and honours the initial dimension", () => {
    render(
      <ChallengeSetup
        availableDimensions={["POEM"]}
        initialDimension="POEM"
        onStart={vi.fn()}
      />,
    );

    expect(action("成语世界").hasAttribute("disabled")).toBe(true);
    expect(action("诗词世界").getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to the first available dimension when the initial is unusable", () => {
    render(
      <ChallengeSetup
        availableDimensions={["IDIOM"]}
        initialDimension="POEM"
        onStart={vi.fn()}
      />,
    );

    expect(action("成语世界").getAttribute("aria-pressed")).toBe("true");
  });

  it("uses initial mode/tier selections and supports canceling", () => {
    const onCancel = vi.fn();
    render(
      <ChallengeSetup
        availableDimensions={["POEM"]}
        initialMode="FIXED_RACE"
        initialTier="EXPERT"
        onCancel={onCancel}
        onStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("取消"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("下一步"));
    expect(action("固定题量竞速").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("下一步"));
    expect(
      action("高手挑战（L5 为主）").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps every choice and primary action at least 64px high", () => {
    render(
      <ChallengeSetup availableDimensions={["POEM"]} onStart={vi.fn()} />,
    );

    for (const label of ["诗词世界", "下一步"]) {
      expect(action(label).style.minHeight).toBe("64px");
    }
  });
});
