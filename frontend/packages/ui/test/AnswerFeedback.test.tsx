import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerFeedback } from "../src/components/AnswerFeedback";

afterEach(cleanup);

describe("AnswerFeedback", () => {
  it("shows a polite success status", () => {
    render(<AnswerFeedback status="correct" />);

    expect(screen.getByRole("status").textContent).toContain("答对啦");
  });

  it("shows wrong-answer guidance without a backdrop and continues", () => {
    const onContinue = vi.fn();
    render(
      <AnswerFeedback
        status="wrong"
        chosenAnswer="má"
        correctAnswer="mā"
        busy={false}
        onContinue={onContinue}
      />,
    );

    const panel = screen.getByRole("dialog");
    const overlay = panel.parentElement;
    expect(overlay?.getAttribute("data-answer-feedback-overlay")).toBe("true");
    expect(overlay?.style.position).toBe("fixed");
    expect(overlay?.style.top).toBe("0px");
    expect(overlay?.style.right).toBe("0px");
    expect(overlay?.style.bottom).toBe("0px");
    expect(overlay?.style.left).toBe("0px");
    expect(overlay?.style.display).toBe("flex");
    expect(overlay?.style.alignItems).toBe("flex-end");
    expect(overlay?.style.justifyContent).toBe("center");
    expect(overlay?.style.overflow).toBe("hidden");
    expect(overlay?.style.pointerEvents).toBe("none");
    expect(panel.style.position).toBe("");
    expect(panel.style.pointerEvents).toBe("auto");
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(panel.style.backgroundColor).not.toBe("rgba(0, 0, 0, 0.5)");
    expect(screen.getByText("再看一看")).toBeTruthy();
    expect(screen.getByText("你选的是：má")).toBeTruthy();
    expect(screen.getByText("正确答案：mā")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("locks the continue action while saving", () => {
    const onContinue = vi.fn();
    render(
      <AnswerFeedback
        status="wrong"
        chosenAnswer="má"
        correctAnswer="mā"
        busy
        onContinue={onContinue}
      />,
    );

    const button = screen.getByRole("button", {
      name: "正在保存",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
