import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeWorldOverview } from "../src";

afterEach(cleanup);

describe("KnowledgeWorldOverview", () => {
  it("shows the informational worlds with completed and total counts", () => {
    render(
      <KnowledgeWorldOverview
        worlds={[
          { id: "poem", title: "古诗", completed: 1, total: 3 },
          { id: "idiom", title: "成语", completed: 0, total: 5 },
        ]}
      />,
    );

    expect(screen.getByText("古诗")).toBeTruthy();
    expect(screen.getByText("成语")).toBeTruthy();
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByText("0 / 5")).toBeTruthy();
    expect(
      screen.queryAllByRole("button", { name: /古诗|成语/ }),
    ).toHaveLength(0);
  });

  it("offers free practice for every world with a handler", () => {
    const onPracticePoem = vi.fn();
    const onPracticeIdiom = vi.fn();
    render(
      <KnowledgeWorldOverview
        worlds={[
          { id: "poem", title: "古诗", completed: 0, total: 5 },
          { id: "idiom", title: "成语", completed: 0, total: 0 },
        ]}
        onPracticePoem={onPracticePoem}
        onPracticeIdiom={onPracticeIdiom}
      />,
    );

    const poem = screen.getByRole("button", { name: "古诗 自由练习" });
    const idiom = screen.getByRole("button", { name: "成语 自由练习" });
    expect(poem.style.minHeight).toBe("64px");
    expect(screen.queryByText("0 / 0")).toBeNull();

    fireEvent.click(poem);
    fireEvent.click(idiom);
    expect(onPracticePoem).toHaveBeenCalledTimes(1);
    expect(onPracticeIdiom).toHaveBeenCalledTimes(1);
  });

  it("offers idiom free practice without a daily count", () => {
    const onPracticeIdiom = vi.fn();
    render(
      <KnowledgeWorldOverview
        worlds={[
          { id: "poem", title: "古诗", completed: 0, total: 5 },
          { id: "idiom", title: "成语", completed: 0, total: 0 },
        ]}
        onPracticeIdiom={onPracticeIdiom}
      />,
    );

    const practice = screen.getByRole("button", {
      name: "成语 自由练习",
    });
    expect(practice.style.minHeight).toBe("64px");
    expect(screen.queryByText("0 / 0")).toBeNull();

    fireEvent.click(practice);
    expect(onPracticeIdiom).toHaveBeenCalledTimes(1);
  });

  it("wraps worlds into two columns on narrow screens", () => {
    render(
      <KnowledgeWorldOverview
        worlds={[
          { id: "poem", title: "古诗", completed: 0, total: 5 },
          { id: "idiom", title: "成语", completed: 0, total: 0 },
        ]}
      />,
    );

    const overview = screen.getByLabelText("今日知识世界");
    expect(overview.style.flexWrap).toBe("wrap");
    for (const tile of Array.from(overview.children)) {
      expect((tile as HTMLElement).style.flexBasis).toBe(
        "calc(50% - 6px)",
      );
    }
  });
});
