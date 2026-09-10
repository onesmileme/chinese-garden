import { describe, expect, it } from "vitest";
import {
  stableAnswerEventId,
  stableChallengeAnswerEventId,
  stableChallengeCompletedEventId,
  stableSettlementEventId,
} from "../src";

describe("stableAnswerEventId", () => {
  it("preserves the legacy ordinary-answer vector", () => {
    expect(stableAnswerEventId("session-1", 4)).toBe(
      "269YWNCCPMR7AD0RMZEKMP1TP3",
    );
  });

  it("keeps challenge answer and completion IDs in distinct namespaces", () => {
    const ids = [
      stableChallengeAnswerEventId("challenge-1", "PARENT", 3),
      stableChallengeCompletedEventId("challenge-1"),
    ];

    expect(ids).toEqual([
      "01M56RWQZBYYA8FA1ZCPA3TDKK",
      "7KYBDAEBTG0SGRCFVR3HAM6A1K",
    ]);
    expect(new Set(ids)).toHaveLength(ids.length);
  });
});

describe("stableSettlementEventId", () => {
  it("returns one stable Crockford ID per session", () => {
    const first = stableSettlementEventId("session-1");

    expect(stableSettlementEventId("session-1")).toBe(first);
    expect(stableSettlementEventId("session-2")).not.toBe(first);
    expect(first).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });
});
