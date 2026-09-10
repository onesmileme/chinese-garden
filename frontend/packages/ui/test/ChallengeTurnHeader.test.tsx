import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChallengeTurnHeader } from "../src/child/challenge/ChallengeTurnHeader";

afterEach(cleanup);

describe("ChallengeTurnHeader", () => {
  it("renders timed remaining seconds with question progress", () => {
    render(
      <ChallengeTurnHeader
        participant="CHILD"
        mode="TIMED"
        remainingMs={42_100}
        current={3}
        total={10}
      />,
    );

    expect(screen.getByText("小朋友加油")).toBeTruthy();
    expect(screen.getByText("00:43")).toBeTruthy();
    expect(screen.getByText("3 / 10")).toBeTruthy();
    expect(screen.queryByText(/答对/)).toBeNull();
    expect(
      (document.querySelector("[data-challenge-progress]") as HTMLElement).style
        .width,
    ).toBe("70.16666666666667%");
  });

  it("renders fixed question progress without elapsed time", () => {
    render(
      <ChallengeTurnHeader
        participant="PARENT"
        mode="FIXED_RACE"
        remainingMs={0}
        current={4}
        total={10}
      />,
    );

    expect(screen.getByText("家长挑战")).toBeTruthy();
    expect(screen.getByText("4 / 10")).toBeTruthy();
    expect(screen.queryByText(/00:/)).toBeNull();
    expect(
      (document.querySelector("[data-challenge-progress]") as HTMLElement).style
        .width,
    ).toBe("40%");
  });

  it("clamps timed and empty fixed progress", () => {
    const { rerender } = render(
      <ChallengeTurnHeader
        participant="CHILD"
        mode="TIMED"
        remainingMs={70_000}
        current={0}
        total={10}
      />,
    );
    expect(
      (document.querySelector("[data-challenge-progress]") as HTMLElement).style
        .width,
    ).toBe("100%");

    rerender(
      <ChallengeTurnHeader
        participant="PARENT"
        mode="FIXED_RACE"
        remainingMs={0}
        current={2}
        total={0}
      />,
    );
    expect(
      (document.querySelector("[data-challenge-progress]") as HTMLElement).style
        .width,
    ).toBe("0%");
  });
});
