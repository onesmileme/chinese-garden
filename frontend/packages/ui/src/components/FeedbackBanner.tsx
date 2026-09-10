import React from "react";
import { defaultTheme } from "../theme";

export interface FeedbackBannerProps {
  status: "correct" | "wrong" | "hint";
  message: string;
}

const colorByStatus: Record<FeedbackBannerProps["status"], string> = {
  correct: defaultTheme.color.correct,
  wrong: defaultTheme.color.wrong,
  hint: defaultTheme.color.primary,
};

export function FeedbackBanner({ status, message }: FeedbackBannerProps) {
  return <div style={{ color: colorByStatus[status] }}>{message}</div>;
}
