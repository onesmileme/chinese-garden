import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InkBackground } from "../src/child/InkBackground";
import { tokens } from "../src/tokens";

afterEach(cleanup);

describe("InkBackground", () => {
  it("renders children and classical decorations by default", () => {
    render(
      <InkBackground>
        <span>今日雅集</span>
      </InkBackground>,
    );

    expect(screen.getByText("今日雅集")).toBeTruthy();
    expect(screen.getAllByLabelText("ink-decor")).toHaveLength(4);
    for (const decoration of tokens.bg.decor) {
      expect(screen.getByText(decoration)).toBeTruthy();
    }
    expect(screen.getByText("成").style.color).toBe(tokens.color.idiom);
  });

  it("preserves children while hiding decorations when decor is false", () => {
    render(
      <InkBackground decor={false}>
        <span>家长中心</span>
      </InkBackground>,
    );

    expect(screen.getByText("家长中心")).toBeTruthy();
    expect(screen.queryByLabelText("ink-decor")).toBeNull();
    for (const decoration of tokens.bg.decor) {
      expect(screen.queryByText(decoration)).toBeNull();
    }
  });
});
