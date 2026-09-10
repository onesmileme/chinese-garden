import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuestionStage } from "../src";

afterEach(cleanup);

describe("QuestionStage", () => {
  it("marks the shared question area and renders its content", () => {
    render(
      <QuestionStage>
        <span>题目内容</span>
      </QuestionStage>,
    );

    expect(
      screen.getByLabelText("答题区").getAttribute("data-question-stage"),
    ).toBe("true");
    expect(screen.getByText("题目内容")).toBeTruthy();
  });
});
