import { describe, expect, it } from "vitest";
import type { LearningEvent } from "../src/events";
import {
  filterCurrentBatchEventIds,
  mergeQuarantined,
  toQuarantined,
} from "../src/sync/rejections";
import type { QuarantinedEvent } from "../src/ports";

const event = (eventId: string): LearningEvent => ({
  eventId,
  childProfileId: "child-1",
  deviceId: "device-1",
  sessionId: "session-1",
  eventType: "LESSON_ANSWER",
  clientSequence: 1,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: 100,
  payload: {},
});

const quarantined = (
  eventId: string,
  quarantinedAt: number,
): QuarantinedEvent => ({
  event: event(eventId),
  code: "INVALID_PAYLOAD",
  quarantinedAt,
});

describe("sync rejection helpers", () => {
  it("keeps unique receipt IDs that belong to the current batch", () => {
    expect(
      filterCurrentBatchEventIds(
        [event("accepted"), event("duplicate")],
        ["accepted", "unknown", "accepted", "duplicate"],
      ),
    ).toEqual(["accepted", "duplicate"]);
  });

  it("maps only unique rejected events from the current batch", () => {
    expect(
      toQuarantined(
        [event("invalid"), event("pending")],
        [
          { eventId: "unknown", code: "INVALID_ENVELOPE" },
          { eventId: "invalid", code: "INVALID_PAYLOAD" },
          { eventId: "invalid", code: "ANSWER_MISMATCH" },
        ],
        1234,
      ),
    ).toEqual([
      {
        event: event("invalid"),
        code: "INVALID_PAYLOAD",
        quarantinedAt: 1234,
      },
    ]);
  });

  it("merges retries idempotently by eventId without replacing the first diagnosis", () => {
    const first = quarantined("same", 100);
    const retried = {
      ...quarantined("same", 200),
      code: "ANSWER_MISMATCH" as const,
    };

    expect(mergeQuarantined([first], [retried])).toEqual([first]);
  });

  it("keeps the newest 100 unique quarantined events", () => {
    const existing = Array.from({ length: 100 }, (_, index) =>
      quarantined(`event-${index}`, index),
    );
    const newest = quarantined("event-100", 100);

    const merged = mergeQuarantined(existing, [newest]);

    expect(merged).toHaveLength(100);
    expect(merged[0].event.eventId).toBe("event-1");
    expect(merged[99]).toEqual(newest);
  });
});
