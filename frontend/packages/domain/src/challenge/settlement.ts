import type {
  ChallengeResultDetails,
  ChallengeSession,
  ChallengeWinner,
} from "./types";

function winnerFor(session: ChallengeSession): ChallengeWinner {
  const { child, parent } = session;
  if (child.correctCount !== parent.correctCount) {
    return child.correctCount > parent.correctCount ? "CHILD" : "PARENT";
  }
  if (
    session.config.mode === "FIXED_RACE" &&
    child.activeElapsedMs !== parent.activeElapsedMs
  ) {
    return child.activeElapsedMs < parent.activeElapsedMs ? "CHILD" : "PARENT";
  }
  return "DRAW";
}

export function settleChallenge(
  session: ChallengeSession,
  playedAt: number,
): ChallengeResultDetails {
  if (session.phase !== "RESULT") {
    throw new Error("challenge is not ready for settlement");
  }
  return {
    winner: winnerFor(session),
    mode: session.config.mode,
    playedAt,
    child: {
      correctCount: session.child.correctCount,
      answeredCount: session.child.answeredCount,
      activeElapsedMs: session.child.activeElapsedMs,
    },
    parent: {
      correctCount: session.parent.correctCount,
      answeredCount: session.parent.answeredCount,
      activeElapsedMs: session.parent.activeElapsedMs,
    },
    replay: {
      mode: session.config.mode,
      tier: session.config.tier,
    },
  };
}
