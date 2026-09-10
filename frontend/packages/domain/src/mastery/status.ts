export type MasteryStatus =
  | "LEARNING"
  | "PRACTICING"
  | "MASTERED"
  | "STABLE"
  | "NEEDS_REPAIR";

export function classifyStatus(input: {
  score: number;
  hasDelayedReviewEvidence: boolean;
  delayedReviewFailing: boolean;
}): MasteryStatus {
  if (input.delayedReviewFailing) return "NEEDS_REPAIR";
  if (input.score >= 85 && input.hasDelayedReviewEvidence) return "STABLE";
  if (input.score >= 70) return "MASTERED";
  if (input.score >= 40) return "PRACTICING";
  return "LEARNING";
}
