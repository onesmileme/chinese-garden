import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeSetup } from "../src/child/challenge/ChallengeSetup";

afterEach(cleanup);

function card(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ChallengeSetup", () => {
  it("uses timed and standard defaults through all four steps", () => {
    const onStart = vi.fn();
    render(
      <ChallengeSetup availableDimensions={["POEM", "IDIOM"]} onStart={onStart} />,
    );

    // Step 1 · 选择挑战世界：诗词世界默认选中并带「推荐」标记。
    expect(screen.getByText("选择挑战世界 📜")).toBeTruthy();
    expect(screen.getByText("步骤 1 / 3")).toBeTruthy();
    expect(card("诗词世界").getAttribute("aria-pressed")).toBe("true");
    expect(card("成语世界").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("推荐")).toBeTruthy();
    expect(screen.getByText("即将开启")).toBeTruthy();
    fireEvent.click(card("下一步"));

    // Step 2 · 选择挑战规则：限时答题模式默认选中。
    expect(screen.getByText("选择挑战规则")).toBeTruthy();
    expect(screen.getByText("步骤 2 / 3")).toBeTruthy();
    expect(card("限时答题模式").getAttribute("aria-pressed")).toBe("true");
    expect(card("固定题量竞速").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("🔥 推荐模式")).toBeTruthy();
    fireEvent.click(card("下一步：进入准备"));

    // Step 3 · 选择家长难度：标准挑战默认选中，含星级与保护说明。
    expect(screen.getByText("选择家长难度")).toBeTruthy();
    expect(screen.getByText("公平竞技 · 关爱让步")).toBeTruthy();
    expect(card("标准挑战").getAttribute("aria-pressed")).toBe("true");
    expect(card("高手挑战").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("★ 平衡推荐")).toBeTruthy();
    expect(screen.getByText(/小朋友已自动受保护/)).toBeTruthy();
    fireEvent.click(card("完成设置，前往对战"));

    // Confirm · 准备开始：VS 卡片与规则配置行。
    expect(screen.getByText("准备开始！")).toBeTruthy();
    expect(screen.getByText("诗词世界")).toBeTruthy();
    expect(screen.getByText("每人 60 秒")).toBeTruthy();
    expect(screen.getByText("家长标准 (L4 为主)")).toBeTruthy();
    expect(screen.getByText("五言/七绝名篇填空")).toBeTruthy();
    expect(screen.getByText("+3 颗星星 · 默契徽章")).toBeTruthy();
    expect(screen.getByText("标准挑战难度")).toBeTruthy();
    fireEvent.click(card("小朋友先来"));

    expect(onStart).toHaveBeenCalledWith({
      dimension: "POEM",
      mode: "TIMED",
      tier: "STANDARD",
    });
  });

  it("allows fixed race, expert tier, dimension switch, and back navigation", () => {
    const onStart = vi.fn();
    render(
      <ChallengeSetup availableDimensions={["POEM", "IDIOM"]} onStart={onStart} />,
    );

    fireEvent.click(card("成语世界"));
    expect(card("成语世界").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("下一步"));

    fireEvent.click(card("固定题量竞速"));
    fireEvent.click(card("限时答题模式"));
    fireEvent.click(card("固定题量竞速"));
    // 返回上一步重选世界 → 回到世界选择，成语世界保持选中。
    fireEvent.click(screen.getByText("返回上一步重选世界"));
    expect(screen.getByText("选择挑战世界 📜")).toBeTruthy();
    expect(card("成语世界").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(card("下一步"));
    fireEvent.click(card("下一步：进入准备"));
    fireEvent.click(card("高手挑战"));
    fireEvent.click(card("标准挑战"));
    fireEvent.click(card("高手挑战"));
    expect(screen.getByText("🔥 L5 为主")).toBeTruthy();
    expect(screen.getByText("答题倒计时减半")).toBeTruthy();
    // 返回上一步修改规则 → 回到规则，固定题量竞速仍选中。
    fireEvent.click(screen.getByText("返回上一步修改规则"));
    expect(card("固定题量竞速").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(card("下一步：进入准备"));
    fireEvent.click(card("完成设置，前往对战"));
    expect(screen.getByText("准备开始！")).toBeTruthy();
    // 返回上一步修改难度 → 回到难度选择。
    fireEvent.click(screen.getByText("返回上一步修改难度"));
    expect(screen.getByText("选择家长难度")).toBeTruthy();

    fireEvent.click(card("完成设置，前往对战"));
    expect(screen.getByText("成语世界")).toBeTruthy();
    expect(screen.getByText("每人 10 题")).toBeTruthy();
    expect(screen.getByText("家长高手 (L5 为主)")).toBeTruthy();
    expect(screen.getByText("成语拼图 · 典故接龙")).toBeTruthy();
    expect(screen.getByText("答对更多者胜出")).toBeTruthy();
    expect(screen.getByText("高手挑战难度")).toBeTruthy();
    fireEvent.click(card("小朋友先来"));

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

    expect(card("成语世界").hasAttribute("disabled")).toBe(true);
    expect(card("诗词世界").getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to the first available dimension when the initial is unusable", () => {
    render(
      <ChallengeSetup
        availableDimensions={["IDIOM"]}
        initialDimension="POEM"
        onStart={vi.fn()}
      />,
    );

    expect(card("成语世界").getAttribute("aria-pressed")).toBe("true");
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

    fireEvent.click(screen.getByText("取消挑战"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(card("下一步"));
    expect(card("固定题量竞速").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("下一步：进入准备"));
    expect(card("高手挑战").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps every choice and primary action at least 64px high", () => {
    render(<ChallengeSetup availableDimensions={["POEM"]} onStart={vi.fn()} />);

    for (const name of ["诗词世界", "下一步"]) {
      expect(card(name).style.minHeight).toBe("64px");
    }
  });
});
