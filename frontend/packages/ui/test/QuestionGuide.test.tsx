import type { GeneratedQuestion } from "@cc/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuestionGuide, questionGuideText } from "../src";

afterEach(cleanup);

type GuideQuestion = Pick<GeneratedQuestion, "questionType" | "prompt">;

function make(
  questionType: GeneratedQuestion["questionType"],
  prompt: string,
): GuideQuestion {
  return { questionType, prompt };
}

describe("QuestionGuide", () => {
  it("describes every supported question type", () => {
    expect(questionGuideText(make("POEM_FILL", "静夜思"))).toBe(
      "把合适的字送回诗句里吧",
    );
    expect(questionGuideText(make("POEM_MATCH_NEXT", "床前明月光"))).toBe(
      "读上句，选出紧接着的下一句",
    );
    expect(questionGuideText(make("IDIOM_CHAIN", "马到成功"))).toBe(
      "接住最后一个字，续出新成语",
    );
    expect(questionGuideText(make("IDIOM_MEANING", "画蛇添足"))).toBe(
      "想一想，这个成语是什么意思？",
    );
  });

  it("renders the idle mascot and guide copy", () => {
    render(<QuestionGuide question={make("POEM_FILL", "静夜思")} />);

    expect(screen.getByLabelText("题目提示")).toBeTruthy();
    expect(screen.getByText("🖌️")).toBeTruthy();
    expect(screen.getByText("把合适的字送回诗句里吧")).toBeTruthy();
  });

  it("throws on an unsupported runtime question type", () => {
    expect(() =>
      questionGuideText(
        make(
          "UNKNOWN" as GeneratedQuestion["questionType"],
          "未知题目",
        ),
      ),
    ).toThrow("unsupported question type: UNKNOWN");
  });
});
