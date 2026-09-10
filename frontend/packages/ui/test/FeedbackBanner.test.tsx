import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedbackBanner } from "../src/components/FeedbackBanner";

describe("FeedbackBanner", () => {
  it("shows the message for correct status", () => {
    render(<FeedbackBanner status="correct" message="答对啦！" />);
    expect(screen.getByText("答对啦！")).toBeTruthy();
  });
  it("shows the message for wrong status", () => {
    render(<FeedbackBanner status="wrong" message="再试一次" />);
    expect(screen.getByText("再试一次")).toBeTruthy();
  });
  it("shows the message for hint status", () => {
    render(<FeedbackBanner status="hint" message="想一想这个字的意思" />);
    expect(screen.getByText("想一想这个字的意思")).toBeTruthy();
  });
});
