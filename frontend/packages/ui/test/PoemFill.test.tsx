import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { GeneratedQuestion } from "@cc/domain";
import { PoemFill } from "../src/components/PoemFill";

afterEach(cleanup);

const question: GeneratedQuestion = {
  knowledgePointId: "poem-jing-ye-si" as GeneratedQuestion["knowledgePointId"],
  questionType: "POEM_FILL",
  seed: "s1",
  prompt: "静夜思",
  options: ["月", "霜", "光"],
  correctAnswer: "0=月|1=霜",
  displayLines: ["床前明＿光", "疑是地上＿"],
  blanks: [
    { index: 0, answer: "月" },
    { index: 1, answer: "霜" },
  ],
  candidates: ["月", "霜", "光"],
};

function fill(candidateLabel: string, blankLabel: string): void {
  fireEvent.click(screen.getByRole("button", { name: candidateLabel }));
  fireEvent.click(screen.getByLabelText(blankLabel));
}

describe("PoemFill", () => {
  it("disables every action and does not answer while locked", () => {
    const onAnswer = vi.fn();
    render(<PoemFill question={question} disabled onAnswer={onAnswer} />);

    expect(
      (screen.getByLabelText("空缺1") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: "月，候选1",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "重置" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "确定" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("空缺1"));
    fireEvent.click(screen.getByRole("button", { name: "月，候选1" }));
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    fireEvent.click(screen.getByRole("button", { name: "重置" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("renders each 64px blank inside its poem line", () => {
    render(<PoemFill question={question} onAnswer={vi.fn()} />);

    expect(screen.getByText("静夜思").style.fontSize).toBe("18px");
    const firstLine = screen.getByLabelText("诗句1");
    const secondLine = screen.getByLabelText("诗句2");
    expect(firstLine.style.fontSize).toBe("30px");
    expect(firstLine.style.lineHeight).toBe("1.8");
    expect(firstLine.textContent).toBe("床前明＿光");
    expect(secondLine.textContent).toBe("疑是地上＿");
    expect(within(firstLine).getByLabelText("空缺1")).toBeTruthy();
    expect(within(secondLine).getByLabelText("空缺2")).toBeTruthy();
    expect(screen.getAllByLabelText(/空缺/)).toHaveLength(2);
    expect(screen.getByLabelText("空缺1").style.borderStyle).toBe("dashed");

    const candidates = screen.getAllByRole("button", { name: /候选/ });
    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.parentElement?.style.gridTemplateColumns).toBe(
      "repeat(4, minmax(0, 1fr))",
    );
    for (const candidate of candidates) {
      expect(candidate.style.minHeight).toBe("64px");
    }
    for (const blank of screen.getAllByLabelText(/空缺/)) {
      expect((blank as HTMLElement).style.minHeight).toBe("64px");
    }
    expect(screen.getByRole("button", { name: "撤销" }).textContent).toBe("↶");
    expect(screen.getByRole("button", { name: "重置" }).textContent).toBe("↺");
  });

  it("only allows submit once all blanks are filled and serializes on submit", () => {
    const onAnswer = vi.fn();
    render(<PoemFill question={question} onAnswer={onAnswer} />);

    const submit = screen.getByRole("button", {
      name: "确定",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    expect(screen.getByLabelText("空缺1").textContent).toBe("＿");
    expect(screen.getByLabelText("空缺2").textContent).toBe("＿");

    fill("月，候选1", "空缺1");
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onAnswer).not.toHaveBeenCalled();

    fill("霜，候选2", "空缺2");
    expect(screen.getByLabelText("空缺1").textContent).toBe("月");
    expect(screen.getByLabelText("空缺2").textContent).toBe("霜");
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("0=月|1=霜");
  });

  it("locks submission after the first submit", () => {
    const onAnswer = vi.fn();
    render(<PoemFill question={question} onAnswer={onAnswer} />);
    fill("月，候选1", "空缺1");
    fill("霜，候选2", "空缺2");
    const submit = screen.getByRole("button", { name: "确定" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(onAnswer).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByLabelText("空缺1"));
    expect(screen.getByLabelText("空缺1").textContent).toBe("月");
  });

  it("removes a filled blank when tapped again", () => {
    render(<PoemFill question={question} onAnswer={vi.fn()} />);
    fill("月，候选1", "空缺1");
    expect(screen.getByLabelText("空缺1").textContent).toBe("月");
    fireEvent.click(screen.getByLabelText("空缺1"));
    expect(screen.getByLabelText("空缺1").textContent).toBe("＿");
  });

  it("ignores tapping a blank with nothing selected and a used candidate", () => {
    render(<PoemFill question={question} onAnswer={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("空缺1"));
    expect(screen.getByLabelText("空缺1").textContent).toBe("＿");

    fill("月，候选1", "空缺1");
    const used = screen.getByRole("button", {
      name: "月，候选1",
    }) as HTMLButtonElement;
    expect(used.disabled).toBe(true);
  });

  it("undoes and resets filled blanks", () => {
    render(<PoemFill question={question} onAnswer={vi.fn()} />);
    const undo = screen.getByRole("button", {
      name: "撤销",
    }) as HTMLButtonElement;
    const reset = screen.getByRole("button", {
      name: "重置",
    }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(reset.disabled).toBe(true);

    fill("月，候选1", "空缺1");
    fill("霜，候选2", "空缺2");
    fireEvent.click(undo);
    expect(screen.getByLabelText("空缺2").textContent).toBe("＿");
    expect(screen.getByLabelText("空缺1").textContent).toBe("月");

    fireEvent.click(reset);
    expect(screen.getByLabelText("空缺1").textContent).toBe("＿");
  });

  it("clears state when the question changes", () => {
    const { rerender } = render(
      <PoemFill question={question} onAnswer={vi.fn()} />,
    );
    fill("月，候选1", "空缺1");

    const nextQuestion: GeneratedQuestion = {
      ...question,
      seed: "s2",
      displayLines: ["＿＿争渡"],
      blanks: [{ index: 0, answer: "争" }],
      candidates: ["争", "渡"],
      correctAnswer: "0=争",
    };
    rerender(<PoemFill question={nextQuestion} onAnswer={vi.fn()} />);
    const nextLine = screen.getByLabelText("诗句1");
    expect(within(nextLine).getByLabelText("空缺1").textContent).toBe("＿");
    expect(nextLine.textContent).toBe("＿＿争渡");
  });

  it("renders safely when structural fields are missing", () => {
    const bare: GeneratedQuestion = {
      knowledgePointId: "poem-x" as GeneratedQuestion["knowledgePointId"],
      questionType: "POEM_FILL",
      seed: "s0",
      prompt: "空诗",
      options: [],
      correctAnswer: "",
    };
    render(<PoemFill question={bare} onAnswer={vi.fn()} />);
    expect(screen.getByText("空诗")).toBeTruthy();
    expect(screen.queryAllByLabelText(/空缺/)).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /候选/ })).toHaveLength(0);
    expect(
      (screen.getByRole("button", { name: "确定" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps placeholders without matching blank metadata as text", () => {
    const mismatched: GeneratedQuestion = {
      ...question,
      displayLines: ["床＿＿"],
      blanks: [{ index: 0, answer: "月" }],
      candidates: ["月", "霜"],
      correctAnswer: "0=月",
    };

    render(<PoemFill question={mismatched} onAnswer={vi.fn()} />);

    const line = screen.getByLabelText("诗句1");
    expect(line.textContent).toBe("床＿＿");
    expect(within(line).getAllByLabelText(/空缺/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/空缺/)).toHaveLength(1);
  });
});
