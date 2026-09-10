import { describe, it, expect } from "vitest";
import { makeEvent } from "../src/events";

const idGen = { ulid: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV" };
const clock = { now: () => 1_700_000_000_000 };

describe("makeEvent", () => {
  it("fills eventId and occurredAt from injected deps", () => {
    const e = makeEvent(idGen, clock, {
      childProfileId: "c1",
      deviceId: "d1",
      sessionId: "s1",
      eventType: "DAY_SETTLED",
      clientSequence: 3,
      contentVersion: "content-v1",
      ruleVersion: "mastery-v1",
      payload: {
        xpAwarded: 18,
        accuracyBonus: 3,
        firstCorrectRate: 0.8,
      },
    });
    expect(e.eventId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(e.occurredAt).toBe(1_700_000_000_000);
    expect(e.clientSequence).toBe(3);
    expect(e.payload).toEqual({
      xpAwarded: 18,
      accuracyBonus: 3,
      firstCorrectRate: 0.8,
    });
  });
});
