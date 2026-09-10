import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ChoiceQuestion } from "../src/components/ChoiceQuestion";

afterEach(cleanup);

describe("ChoiceQuestion", () => {
  it("renders prompt and all options, fires onSelect with clicked value", () => {
    const onSelect = vi.fn();
    render(
      <ChoiceQuestion
        prompt="妈"
        options={["妈妈 / mother", "爸爸 / father", "哥哥 / elder brother"]}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText("妈")).toBeTruthy();
    for (const option of screen.getAllByRole("button")) {
      expect(option.style.minHeight).toBe("72px");
      expect(option.style.borderRadius).toBe("8px");
    }
    fireEvent.click(screen.getByText("爸爸 / father"));
    expect(onSelect).toHaveBeenCalledWith("爸爸 / father");
  });

  it("disables selection and renders four short options in a 2 by 2 grid", () => {
    const onSelect = vi.fn();
    render(
      <ChoiceQuestion
        prompt="妈"
        options={["mā", "má", "mǎ", "mà"]}
        disabled
        onSelect={onSelect}
      />,
    );

    for (const option of screen.getAllByRole("button")) {
      expect((option as HTMLButtonElement).disabled).toBe(true);
      expect(option.style.minHeight).toBe("72px");
    }
    fireEvent.click(screen.getByRole("button", { name: "mā" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText("答案选项").style.gridTemplateColumns).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
  });

  it("renders a semantic prompt label when provided", () => {
    render(
      <ChoiceQuestion
        prompt="床前明月光"
        promptLabel="上句"
        options={["疑是地上霜", "举头望明月", "低头思故乡", "对影成三人"]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("题面标签").textContent).toBe("上句");
  });

  it("omits the prompt label when none is provided", () => {
    render(
      <ChoiceQuestion
        prompt="床前明月光"
        options={["疑是地上霜", "举头望明月"]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("题面标签")).toBeNull();
  });
});
