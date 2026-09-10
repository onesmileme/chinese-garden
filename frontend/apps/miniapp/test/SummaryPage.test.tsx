// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SummaryPage from "../src/pages/summary";
import { makeDaily, makeState } from "./page-fixtures";

afterEach(cleanup);

describe("miniapp SummaryPage", () => {
  it("settles a complete day once and clears active progress", async () => {
    const state = makeState({ daily: makeDaily(15) });
    render(<SummaryPage state={state} now={() => 200} />);

    await waitFor(() => {
      expect(screen.getByText(/获得 XP/)).toBeTruthy();
    });
    expect(state.getState()).toMatchObject({
      activeDaily: null,
      settledDayCount: 1,
    });
  });
});
