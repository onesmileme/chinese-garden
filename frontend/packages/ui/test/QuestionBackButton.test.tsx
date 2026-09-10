import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionBackButton } from "../src";

afterEach(cleanup);

describe("QuestionBackButton", () => {
  it("renders a circular 44px back action", () => {
    const onBack = vi.fn();
    render(<QuestionBackButton onBack={onBack} />);

    const back = screen.getByRole("button", { name: "返回学习路线" });
    expect(back.style.width).toBe("44px");
    expect(back.style.height).toBe("44px");
    expect(back.style.borderRadius).toBe("50%");
    const arrow = back.querySelector(
      '[data-back-arrow="true"]',
    ) as HTMLElement;
    expect(arrow).toBeTruthy();
    expect(arrow.style.width).toBe("100%");
    expect(arrow.style.height).toBe("100%");
    expect(arrow.style.display).toBe("flex");
    expect(arrow.style.alignItems).toBe("center");
    expect(arrow.style.justifyContent).toBe("center");
    expect(arrow.style.lineHeight).toBe("1");

    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("disables navigation while busy", () => {
    const onBack = vi.fn();
    render(<QuestionBackButton busy onBack={onBack} />);

    const back = screen.getByRole("button", {
      name: "返回学习路线",
    }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);

    fireEvent.click(back);
    expect(onBack).not.toHaveBeenCalled();
  });
});
