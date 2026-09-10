import type { LearningEvent } from "../events";

export function mergeEvents(
  local: LearningEvent[],
  remote: LearningEvent[],
): LearningEvent[] {
  const byId = new Map<string, LearningEvent>();
  for (const e of [...local, ...remote]) {
    if (!byId.has(e.eventId)) byId.set(e.eventId, e);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.occurredAt - b.occurredAt ||
      a.clientSequence - b.clientSequence ||
      a.eventId.localeCompare(b.eventId),
  );
}
