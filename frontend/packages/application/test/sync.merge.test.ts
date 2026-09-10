import { describe, it, expect } from "vitest";
import { mergeEvents } from "../src/sync/merge";
import type { LearningEvent } from "../src/events";

const ev = (id: string, at: number, seq: number): LearningEvent => ({
  eventId: id,
  childProfileId: "c1",
  deviceId: "d",
  sessionId: "s",
  eventType: "LESSON_ANSWER",
  clientSequence: seq,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: at,
  payload: {},
});

describe("mergeEvents", () => {
  it("dedupes by eventId keeping one copy", () => {
    const out = mergeEvents([ev("a", 1, 0)], [ev("a", 1, 0), ev("b", 2, 0)]);
    expect(out.map((e) => e.eventId)).toEqual(["a", "b"]);
  });
  it("is order-independent: shuffled inputs yield identical projection order", () => {
    const local = [ev("c", 3, 0), ev("a", 1, 0)];
    const remote = [ev("b", 2, 0), ev("a", 1, 0)];
    const out1 = mergeEvents(local, remote).map((e) => e.eventId);
    const out2 = mergeEvents(remote, local).map((e) => e.eventId);
    expect(out1).toEqual(["a", "b", "c"]);
    expect(out1).toEqual(out2);
  });
  it("breaks occurredAt ties by clientSequence ascending", () => {
    const out = mergeEvents([ev("x", 5, 2)], [ev("y", 5, 1)]);
    expect(out.map((e) => e.eventId)).toEqual(["y", "x"]);
  });
  it("breaks occurredAt+clientSequence ties by eventId localeCompare", () => {
    const out = mergeEvents([ev("b", 5, 1)], [ev("a", 5, 1)]);
    expect(out.map((e) => e.eventId)).toEqual(["a", "b"]);
  });
});
