// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuardianPage from "../src/pages/guardian";
import { makeDaily, makeState } from "./page-fixtures";

afterEach(cleanup);

describe("miniapp GuardianPage", () => {
  it("shows learning data without child decorations", () => {
    render(
      <GuardianPage state={makeState({ daily: makeDaily(6) })} />,
    );

    expect(screen.getByText("家长中心")).toBeTruthy();
    expect(screen.getByText("6 / 15")).toBeTruthy();
    expect(screen.getByText("Lv.1")).toBeTruthy();
    expect(screen.queryAllByLabelText("ink-decor")).toHaveLength(0);
  });
});
