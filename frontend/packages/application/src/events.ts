import type { LearningEventContract } from "@cc/content-schema";
import type { Clock, IdGen } from "./ports";

export type LearningEvent = LearningEventContract;
export type LearningEventType = LearningEvent["eventType"];

type DaySettledEvent = Extract<LearningEvent, { eventType: "DAY_SETTLED" }>;

export function makeEvent(
  idGen: IdGen,
  clock: Clock,
  base: Omit<DaySettledEvent, "eventId" | "occurredAt">,
): DaySettledEvent {
  return { ...base, eventId: idGen.ulid(), occurredAt: clock.now() };
}
