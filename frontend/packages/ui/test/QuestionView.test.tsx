import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { GeneratedQuestion } from "@cc/domain";
import { QuestionView } from "../src/components/QuestionView";

// 根 vitest 未开启 globals，多个 render 的用例须手动清理 DOM。
afterEach(cleanup);

function make(overrides: Partial<GeneratedQuestion>): GeneratedQuestion {
  return {
    knowledgePointId: "kp" as GeneratedQuestion["knowledgePointId"],
    questionType: "POEM_MATCH_NEXT",
    seed: "s1",
    prompt: "床前明月光",
    options: ["疑是地上霜", "举头望明月"],
    correctAnswer: "疑是地上霜",
    ...overrides,
  };
}

describe("QuestionView dispatch (all 4 types)", () => {
  it("routes POEM_MATCH_NEXT to PoemMatchNext", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({ questionType: "POEM_MATCH_NEXT" })}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByLabelText("题面标签").textContent).toBe("上句");
    fireEvent.click(screen.getByText("疑是地上霜"));
    expect(onAnswer).toHaveBeenCalledWith("疑是地上霜");
  });

  it("disables answers for POEM_MATCH_NEXT", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({ questionType: "POEM_MATCH_NEXT" })}
        disabled
        onAnswer={onAnswer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "疑是地上霜" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("routes IDIOM_MEANING to IdiomMeaning", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "IDIOM_MEANING",
          prompt: "画蛇添足",
          options: ["多此一举", "恰到好处", "画技高超", "十分必要"],
          correctAnswer: "多此一举",
        })}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByLabelText("题面标签").textContent).toBe("成语");
    fireEvent.click(screen.getByText("多此一举"));
    expect(onAnswer).toHaveBeenCalledWith("多此一举");
  });

  it("disables answers for IDIOM_MEANING", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "IDIOM_MEANING",
          prompt: "画蛇添足",
          options: ["多此一举", "恰到好处", "画技高超", "十分必要"],
          correctAnswer: "多此一举",
        })}
        disabled
        onAnswer={onAnswer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "多此一举" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("routes POEM_FILL to PoemFill and serializes filled blanks on submit", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "POEM_FILL",
          prompt: "静夜思",
          options: ["月", "光", "霜"],
          correctAnswer: "0=月|1=霜",
          displayLines: ["床前明＿光", "疑是地上＿"],
          blanks: [
            { index: 0, answer: "月" },
            { index: 1, answer: "霜" },
          ],
          candidates: ["月", "光", "霜"],
        })}
        onAnswer={onAnswer}
      />,
    );
    // 依次选候选并放入空缺。
    fireEvent.click(screen.getByRole("button", { name: "月，候选1" }));
    fireEvent.click(screen.getByLabelText("空缺1"));
    fireEvent.click(screen.getByRole("button", { name: "霜，候选3" }));
    fireEvent.click(screen.getByLabelText("空缺2"));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onAnswer).toHaveBeenCalledWith("0=月|1=霜");
  });

  it("disables POEM_FILL controls", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "POEM_FILL",
          prompt: "静夜思",
          options: ["月", "霜"],
          correctAnswer: "0=月",
          displayLines: ["床前明＿光"],
          blanks: [{ index: 0, answer: "月" }],
          candidates: ["月", "霜"],
        })}
        disabled
        onAnswer={onAnswer}
      />,
    );

    expect(
      (screen.getByLabelText("空缺1") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: "月，候选1",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "月，候选1" }));
    fireEvent.click(screen.getByLabelText("空缺1"));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("routes IDIOM_CHAIN and auto-submits the assembled idiom", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "IDIOM_CHAIN",
          prompt: "等闲视之",
          options: ["人", "人", "平", "等", "海", "四", "家", "为"],
          correctAnswer: "人人平等",
          acceptedAnswers: ["人人平等"],
        })}
        onAnswer={onAnswer}
      />,
    );

    for (const name of ["人，候选1", "人，候选2", "平，候选3", "等，候选4"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("人人平等");
  });

  it("disables IDIOM_CHAIN controls", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionView
        question={make({
          questionType: "IDIOM_CHAIN",
          prompt: "等闲视之",
          options: ["人", "人", "平", "等"],
          correctAnswer: "人人平等",
          acceptedAnswers: ["人人平等"],
        })}
        disabled
        onAnswer={onAnswer}
      />,
    );

    expect(
      (screen.getByRole("button", {
        name: "人，候选1",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "人，候选1" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("throws on an unsupported runtime question type", () => {
    expect(() =>
      render(
        <QuestionView
          question={make({
            questionType: "UNKNOWN" as GeneratedQuestion["questionType"],
          })}
          onAnswer={vi.fn()}
        />,
      ),
    ).toThrow("unsupported question type: UNKNOWN");
  });
});
