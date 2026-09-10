import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { GeneratedQuestion } from "@cc/domain";
import {
  CORRECT_FEEDBACK_MS,
} from "../src/components/AnswerFeedback";
import { QuestionFlow } from "../src/components/QuestionFlow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const question: GeneratedQuestion = {
  knowledgePointId: "hz-ma" as GeneratedQuestion["knowledgePointId"],
  questionType: "POEM_MATCH_NEXT",
  seed: "s1",
  prompt: "床前明月光",
  options: ["疑是地上霜", "举头望明月"],
  correctAnswer: "疑是地上霜",
};

const nextQuestion: GeneratedQuestion = {
  ...question,
  seed: "s2",
  prompt: "春眠不觉晓",
  options: ["举头望明月", "疑是地上霜"],
  correctAnswer: "举头望明月",
};

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("QuestionFlow", () => {
  it("reports an operable question once across rerenders and wrong retry", async () => {
    const onQuestionReady = vi.fn();
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onQuestionReady={onQuestionReady}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
      />,
    );

    expect(onQuestionReady).toHaveBeenCalledOnce();
    expect(onQuestionReady).toHaveBeenCalledWith(question);

    rerender(
      <QuestionFlow
        question={{ ...question }}
        onQuestionReady={onQuestionReady}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));
    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(onQuestionReady).toHaveBeenCalledOnce();
  });

  it("reports a replacement question only after the prior correct lock ends", async () => {
    vi.useFakeTimers();
    const firstReady = vi.fn();
    const latestReady = vi.fn();
    const onAnswered = vi.fn(async () => {});
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onQuestionReady={firstReady}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );

    expect(firstReady).toHaveBeenCalledWith(question);
    fireEvent.click(screen.getByRole("button", { name: "疑是地上霜" }));
    rerender(
      <QuestionFlow
        question={nextQuestion}
        onQuestionReady={firstReady}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );
    rerender(
      <QuestionFlow
        question={nextQuestion}
        onQuestionReady={latestReady}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS - 1);
    });
    expect(firstReady).toHaveBeenCalledOnce();
    expect(latestReady).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(firstReady).toHaveBeenCalledOnce();
    expect(latestReady).toHaveBeenCalledOnce();
    expect(latestReady).toHaveBeenCalledWith(nextQuestion);

    rerender(
      <QuestionFlow
        question={{ ...nextQuestion }}
        onQuestionReady={latestReady}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );
    expect(latestReady).toHaveBeenCalledOnce();
  });

  it("reserves stable space for correct feedback before answering", () => {
    render(
      <QuestionFlow
        question={question}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
      />,
    );

    const slot = document.querySelector(
      '[data-correct-feedback-slot="true"]',
    ) as HTMLElement;
    expect(slot.style.minHeight).toBe("48px");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("accepts an idle question replacement without emitting busy state", () => {
    const onBusyChange = vi.fn();
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    rerender(
      <QuestionFlow
        question={nextQuestion}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    expect(screen.getByText("春眠不觉晓")).toBeTruthy();
    expect(onBusyChange).not.toHaveBeenCalled();
  });

  it("submits a correct answer immediately and locks answers for 600ms", async () => {
    vi.useFakeTimers();
    const onAnswered = vi.fn(async () => {});
    const onCue = vi.fn();
    const onBusyChange = vi.fn();
    render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={onCue}
        onBusyChange={onBusyChange}
      />,
    );

    const correct = screen.getByRole("button", { name: "疑是地上霜" });
    fireEvent.click(correct);
    fireEvent.click(correct);

    expect(onAnswered).toHaveBeenCalledOnce();
    expect(onAnswered).toHaveBeenCalledWith(true, "疑是地上霜");
    expect(onCue).toHaveBeenCalledOnce();
    expect(onCue).toHaveBeenCalledWith("correct");
    expect(screen.getByRole("status").textContent).toContain("答对啦");
    expect(screen.getByLabelText("题目提示")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "举头望明月" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(onBusyChange.mock.calls).toEqual([[true]]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS - 1);
    });
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("keeps a replacement question locked until correct feedback finishes", async () => {
    vi.useFakeTimers();
    const onAnswered = vi.fn(async () => {});
    const onBusyChange = vi.fn();
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "疑是地上霜" }));
    rerender(
      <QuestionFlow
        question={nextQuestion}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "举头望明月" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "举头望明月" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("releases the correct-answer lock after persistence rejects", async () => {
    vi.useFakeTimers();
    const onAnswered = vi
      .fn<(correct: boolean, chosenAnswer: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    const onBusyChange = vi.fn();
    render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "疑是地上霜" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "疑是地上霜" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "疑是地上霜" }));
    expect(onAnswered).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });
    expect(onBusyChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
    ]);
  });

  it("shows wrong feedback and persists only once after confirmation", async () => {
    const pending = deferred();
    const onAnswered = vi.fn(() => pending.promise);
    const onCue = vi.fn();
    const onBusyChange = vi.fn();
    render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={onCue}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));

    expect(onCue).toHaveBeenCalledOnce();
    expect(onCue).toHaveBeenCalledWith("wrong");
    expect(onAnswered).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(screen.getByText("你选的是：举头望明月")).toBeTruthy();
    expect(screen.getByText("正确答案：疑是地上霜")).toBeTruthy();
    for (const answer of screen.getAllByLabelText("答案选项")[0]!
      .children) {
      expect((answer as HTMLButtonElement).disabled).toBe(true);
    }

    const continueButton = screen.getByRole("button", { name: "我记住啦" });
    act(() => {
      continueButton.click();
      continueButton.click();
    });
    expect(onAnswered).toHaveBeenCalledOnce();
    expect(onAnswered).toHaveBeenCalledWith(false, "举头望明月");
    expect(
      (screen.getByRole("button", {
        name: "正在保存",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    pending.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("reports a wrong answer selection before feedback confirmation", async () => {
    const calls: string[] = [];
    const onAnswerSelected = vi.fn(
      (chosenAnswer: string, correct: boolean) => {
        calls.push(`selected:${chosenAnswer}:${correct}`);
      },
    );
    const onAnswered = vi.fn(async (_correct: boolean, chosenAnswer: string) => {
      calls.push(`answered:${chosenAnswer}`);
    });
    render(
      <QuestionFlow
        question={question}
        onAnswerSelected={onAnswerSelected}
        onAnswered={onAnswered}
        onCue={() => {
          calls.push("cue");
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));

    expect(calls).toEqual(["selected:举头望明月:false", "cue"]);
    expect(onAnswerSelected).toHaveBeenCalledOnce();
    expect(onAnswerSelected).toHaveBeenCalledWith("举头望明月", false);
    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(calls).toEqual([
      "selected:举头望明月:false",
      "cue",
      "answered:举头望明月",
    ]);
    expect(onAnswerSelected).toHaveBeenCalledOnce();
  });

  it("reports each UI submission once when persistence is retried", async () => {
    vi.useFakeTimers();
    const onAnswerSelected = vi.fn();
    const onAnswered = vi
      .fn<(correct: boolean, chosenAnswer: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    render(
      <QuestionFlow
        question={question}
        onAnswerSelected={onAnswerSelected}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );

    const correct = screen.getByRole("button", { name: "疑是地上霜" });
    fireEvent.click(correct);
    fireEvent.click(correct);

    expect(onAnswerSelected).toHaveBeenCalledTimes(1);
    expect(onAnswerSelected).toHaveBeenLastCalledWith("疑是地上霜", true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });
    fireEvent.click(correct);

    expect(onAnswerSelected).toHaveBeenCalledTimes(2);
    expect(onAnswered).toHaveBeenCalledTimes(2);
  });

  it("retains wrong feedback and permits retry after persistence rejects", async () => {
    const onAnswered = vi
      .fn<(correct: boolean, chosenAnswer: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    const onBusyChange = vi.fn();
    render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));
    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "我记住啦" })).toBeTruthy(),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onBusyChange.mock.calls).toEqual([[true]]);

    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onAnswered).toHaveBeenCalledTimes(2);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("clears stale wrong feedback when the question changes", async () => {
    const oldPersistence = deferred();
    const onAnswered = vi
      .fn<(correct: boolean, chosenAnswer: string) => Promise<void>>()
      .mockImplementationOnce(() => oldPersistence.promise)
      .mockResolvedValueOnce(undefined);
    const onBusyChange = vi.fn();
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));
    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    rerender(
      <QuestionFlow
        question={nextQuestion}
        onAnswered={onAnswered}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));
    expect(onAnswered).toHaveBeenCalledTimes(2);

    oldPersistence.reject(new Error("stale save failed"));
    await Promise.resolve();
    expect(onBusyChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
    ]);
  });

  it("ignores a stale successful wrong-answer save", async () => {
    const oldPersistence = deferred();
    const onBusyChange = vi.fn();
    const { rerender } = render(
      <QuestionFlow
        question={question}
        onAnswered={() => oldPersistence.promise}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));
    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    rerender(
      <QuestionFlow
        question={nextQuestion}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
        onBusyChange={onBusyChange}
      />,
    );

    oldPersistence.resolve();
    await act(async () => {
      await oldPersistence.promise;
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("春眠不觉晓")).toBeTruthy();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("accepts a non-canonical idiom answer", () => {
    vi.useFakeTimers();
    const onAnswered = vi.fn(async () => {});
    render(
      <QuestionFlow
        question={{
          ...question,
          questionType: "IDIOM_CHAIN",
          prompt: "等闲视之",
          options: ["人", "人", "平", "等", "海", "四", "家", "为"],
          correctAnswer: "人人平等",
          acceptedAnswers: ["人人平等", "人平等人"],
        }}
        onAnswered={onAnswered}
        onCue={vi.fn()}
      />,
    );

    for (const name of ["人，候选1", "平，候选3", "等，候选4", "人，候选2"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    expect(onAnswered).toHaveBeenCalledOnce();
    expect(onAnswered).toHaveBeenCalledWith(true, "人平等人");
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("keeps exact-answer behavior for legacy single-answer questions", () => {
    render(
      <QuestionFlow
        question={question}
        onAnswered={vi.fn(async () => {})}
        onCue={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "举头望明月" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("正确答案：疑是地上霜")).toBeTruthy();
  });
});
