import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { GeneratedQuestion } from "@cc/domain";
import { IdiomChain } from "../src/components/IdiomChain";

afterEach(cleanup);

const question: GeneratedQuestion = {
  knowledgePointId: "cy-deng-xian-shi-zhi" as GeneratedQuestion["knowledgePointId"],
  questionType: "IDIOM_CHAIN",
  seed: "idiom-1",
  prompt: "等闲视之",
  options: ["人", "人", "平", "等", "海", "四", "家", "为"],
  correctAnswer: "人人平等",
  acceptedAnswers: ["人人平等", "人平等人"],
};

describe("IdiomChain", () => {
  it("disables every action and does not answer while locked", () => {
    const onAnswer = vi.fn();
    render(<IdiomChain question={question} disabled onAnswer={onAnswer} />);

    for (const candidate of screen.getAllByRole("button", {
      name: /候选/,
    })) {
      expect((candidate as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(candidate);
    }
    const undo = screen.getByRole("button", {
      name: "撤销",
    }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fireEvent.click(undo);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("renders the starting idiom, four slots, and 64px candidate controls", () => {
    render(
      <IdiomChain
        question={{ ...question, prompt: "马到成功" }}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByText("马到成功")).toBeTruthy();
    const prompt = screen.getByLabelText("接龙提示");
    expect(prompt.style.textAlign).toBe("center");
    expect(prompt.style.background).toBe("#fffdf7");
    const hint = screen.getByText("接「功」音");
    expect(hint.style.color).toBe("#607169");
    const slots = screen.getAllByLabelText(/答案位/);
    expect(slots).toHaveLength(4);
    expect(slots[0]?.parentElement?.style.gridTemplateColumns).toBe(
      "repeat(4, minmax(0, 1fr))",
    );
    for (const slot of slots) {
      expect(slot.style.minWidth).toBe("0");
      expect(slot.style.overflowWrap).toBe("anywhere");
    }
    const candidates = screen.getAllByRole("button", { name: /候选/ });
    expect(candidates).toHaveLength(8);
    expect(candidates[0]?.parentElement?.style.gridTemplateColumns).toBe(
      "repeat(4, minmax(0, 1fr))",
    );
    for (const candidate of candidates) {
      expect(candidate.style.minHeight).toBe("64px");
      expect(candidate.style.minWidth).toBe("0");
      expect(candidate.style.overflowWrap).toBe("anywhere");
    }
    expect(screen.getByRole("button", { name: "撤销" }).textContent).toBe("↶");
    expect(screen.queryByRole("button", { name: "确定" })).toBeNull();
  });

  it("reads the final Unicode code point and handles an empty prompt", () => {
    const { rerender } = render(
      <IdiomChain
        question={{ ...question, prompt: "马到成𠮷" }}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByText("接「𠮷」音")).toBeTruthy();

    rerender(
      <IdiomChain question={{ ...question, prompt: "" }} onAnswer={vi.fn()} />,
    );

    expect(screen.getByText("接「」音")).toBeTruthy();
  });

  it("selects duplicate characters independently and undoes only the last index", () => {
    render(<IdiomChain question={question} onAnswer={vi.fn()} />);

    const firstDuplicate = screen.getByRole("button", {
      name: "人，候选1",
    }) as HTMLButtonElement;
    const secondDuplicate = screen.getByRole("button", {
      name: "人，候选2",
    }) as HTMLButtonElement;
    fireEvent.click(firstDuplicate);
    fireEvent.click(secondDuplicate);

    expect(firstDuplicate.disabled).toBe(true);
    expect(secondDuplicate.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(firstDuplicate.disabled).toBe(true);
    expect(secondDuplicate.disabled).toBe(false);
  });

  it("ignores stale clicks for a selected candidate and after submission", () => {
    const onAnswer = vi.fn();
    render(<IdiomChain question={question} onAnswer={onAnswer} />);

    const first = screen.getByRole("button", {
      name: "人，候选1",
    }) as HTMLButtonElement;
    fireEvent.click(first);
    first.disabled = false;
    fireEvent.click(first);

    for (const name of ["人，候选2", "平，候选3", "等，候选4"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    const staleCandidate = screen.getByRole("button", {
      name: "海，候选5",
    }) as HTMLButtonElement;
    staleCandidate.disabled = false;
    fireEvent.click(staleCandidate);

    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("人人平等");
  });

  it("submits exactly once when the fourth character is selected", () => {
    const onAnswer = vi.fn();
    render(<IdiomChain question={question} onAnswer={onAnswer} />);

    for (const name of ["人，候选1", "人，候选2", "平，候选3", "等，候选4"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    fireEvent.click(screen.getByRole("button", { name: "海，候选5" }));

    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("人人平等");
    expect(
      (screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("clears selection and the submission guard when the question changes", async () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <IdiomChain question={question} onAnswer={onAnswer} />,
    );
    for (const name of ["人，候选1", "人，候选2", "平，候选3", "等，候选4"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    const nextQuestion: GeneratedQuestion = {
      ...question,
      seed: "idiom-2",
      prompt: "家喻户晓",
      options: ["四", "海", "为", "家", "人", "平", "等", "安"],
      correctAnswer: "四海为家",
      acceptedAnswers: ["四海为家"],
    };
    rerender(<IdiomChain question={nextQuestion} onAnswer={onAnswer} />);

    await waitFor(() =>
      expect(
        (screen.getByRole("button", {
          name: "四，候选1",
        }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    for (const name of ["四，候选1", "海，候选2", "为，候选3", "家，候选4"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith("四海为家");
  });
});
