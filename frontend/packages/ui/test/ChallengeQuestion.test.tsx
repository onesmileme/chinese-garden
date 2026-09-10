import type { GeneratedQuestion } from "@cc/domain";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeQuestion } from "../src/child/challenge/ChallengeQuestion";

afterEach(cleanup);

const question: GeneratedQuestion = {
  knowledgePointId: "cy-hstz-画蛇添足" as GeneratedQuestion["knowledgePointId"],
  questionType: "IDIOM_MEANING",
  seed: "seed-1",
  prompt: "画蛇添足",
  options: ["多此一举", "恰到好处", "画技高超"],
  correctAnswer: "多此一举",
};

describe("ChallengeQuestion", () => {
  it("advances immediately on a correct answer", () => {
    vi.useFakeTimers();
    const onAnswered = vi.fn();
    const onWrongSubmitted = vi.fn();
    render(
      <ChallengeQuestion
        question={question}
        onAnswered={onAnswered}
        onWrongSubmitted={onWrongSubmitted}
      />,
    );

    fireEvent.click(screen.getByText("多此一举"));
    expect(onAnswered).toHaveBeenCalledWith(true, "多此一举");
    expect(vi.getTimerCount()).toBe(0);
    expect(onWrongSubmitted).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("saves a wrong answer, shows feedback, then advances on confirmation", async () => {
    const onAnswered = vi.fn();
    const onWrongSubmitted = vi.fn();
    render(
      <ChallengeQuestion
        question={question}
        onAnswered={onAnswered}
        onWrongSubmitted={onWrongSubmitted}
      />,
    );

    fireEvent.click(screen.getByText("恰到好处"));
    expect(onWrongSubmitted).toHaveBeenCalledWith("恰到好处");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "多此一举" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("再看一看")).toBeTruthy();
    expect(screen.getByText("正确答案：多此一举")).toBeTruthy();

    // A second choice while feedback is open is ignored.
    fireEvent.click(screen.getByRole("button", { name: "画技高超" }));
    expect(onWrongSubmitted).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    await waitFor(() =>
      expect(onAnswered).toHaveBeenCalledWith(false, "恰到好处"),
    );
  });

  it("renders restored wrong feedback and ignores a no-op next", async () => {
    const onAnswered = vi.fn();
    render(
      <ChallengeQuestion
        question={question}
        initialWrongAnswer="画技高超"
        onAnswered={onAnswered}
        onWrongSubmitted={vi.fn()}
      />,
    );

    expect(screen.getByText("你选的是：画技高超")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "多此一举" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "我记住啦" }));
    await waitFor(() =>
      expect(onAnswered).toHaveBeenCalledWith(false, "画技高超"),
    );
    // Feedback is cleared; a subsequent stray next has nothing to confirm.
    onAnswered.mockClear();
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it("locks while saving and retries the first wrong answer before showing feedback", async () => {
    let rejectFirst!: (reason: Error) => void;
    const firstSave = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const onWrongSubmitted = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce();
    const onAnswered = vi.fn();
    render(
      <ChallengeQuestion
        question={question}
        onAnswered={onAnswered}
        onWrongSubmitted={onWrongSubmitted}
      />,
    );

    fireEvent.click(screen.getByText("恰到好处"));
    expect(
      (screen.getByRole("button", { name: "画技高超" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "画技高超" }));
    expect(onWrongSubmitted).toHaveBeenCalledTimes(1);

    rejectFirst(new Error("save failed"));
    expect(
      await screen.findByRole("button", { name: "重试保存" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(onWrongSubmitted).toHaveBeenNthCalledWith(2, "恰到好处");
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it("awaits a correct answer and retries without changing the answer fact", async () => {
    let rejectFirst!: (reason: Error) => void;
    const firstSave = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const onAnswered = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce();
    const onWrongSubmitted = vi.fn();
    render(
      <ChallengeQuestion
        question={question}
        onAnswered={onAnswered}
        onWrongSubmitted={onWrongSubmitted}
      />,
    );

    fireEvent.click(screen.getByText("多此一举"));
    expect(
      (screen.getByRole("button", { name: "画技高超" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "画技高超" }));
    expect(onAnswered).toHaveBeenCalledTimes(1);

    rejectFirst(new Error("save failed"));
    fireEvent.click(
      await screen.findByRole("button", { name: "重试保存" }),
    );
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(2));
    expect(onAnswered).toHaveBeenNthCalledWith(1, true, "多此一举");
    expect(onAnswered).toHaveBeenNthCalledWith(2, true, "多此一举");
    expect(onWrongSubmitted).not.toHaveBeenCalled();
  });

  it("submits only once when an answer receives two clicks in one turn", async () => {
    let finishSave!: () => void;
    const onAnswered = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    render(
      <ChallengeQuestion
        question={question}
        onAnswered={onAnswered}
        onWrongSubmitted={vi.fn()}
      />,
    );
    const answer = screen.getByRole("button", { name: "多此一举" });

    act(() => {
      answer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      answer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAnswered).toHaveBeenCalledTimes(1);
    await act(async () => finishSave());
  });
});
