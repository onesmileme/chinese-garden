import type { LearningEvent } from "../events";
import type {
  PushResult,
  QuarantinedEvent,
  RejectedEvent,
} from "../ports";

const QUARANTINE_LIMIT = 100;

export interface CurrentBatchReceipts {
  accepted: string[];
  duplicated: string[];
  rejected: RejectedEvent[];
}

export function filterCurrentBatchEventIds(
  batch: readonly LearningEvent[],
  receiptIds: readonly string[],
): string[] {
  const batchIds = new Set(batch.map((event) => event.eventId));
  return [...new Set(receiptIds)].filter((eventId) => batchIds.has(eventId));
}

export function normalizeCurrentBatchReceipts(
  batch: readonly LearningEvent[],
  receipts: Pick<PushResult, "accepted" | "duplicated" | "rejected">,
): CurrentBatchReceipts {
  const accepted = filterCurrentBatchEventIds(batch, receipts.accepted);
  const duplicated = filterCurrentBatchEventIds(batch, receipts.duplicated);
  const batchIds = new Set(batch.map((event) => event.eventId));
  const rejected = receipts.rejected.filter(
    (rejection, index, all) =>
      batchIds.has(rejection.eventId) &&
      all.findIndex((item) => item.eventId === rejection.eventId) === index,
  );
  const categories = [
    ["accepted", accepted],
    ["duplicated", duplicated],
    ["rejected", rejected.map((item) => item.eventId)],
  ] as const;
  const seen = new Map<string, string>();

  for (const [category, eventIds] of categories) {
    for (const eventId of eventIds) {
      const previous = seen.get(eventId);
      if (previous !== undefined) {
        throw new Error(
          `contradictory sync receipt for ${eventId}: ${previous} and ${category}`,
        );
      }
      seen.set(eventId, category);
    }
  }

  return { accepted, duplicated, rejected };
}

export function toQuarantined(
  batch: readonly LearningEvent[],
  rejected: readonly RejectedEvent[],
  quarantinedAt: number,
): QuarantinedEvent[] {
  const byId = new Map(batch.map((event) => [event.eventId, event]));
  const seen = new Set<string>();
  const quarantined: QuarantinedEvent[] = [];

  for (const rejection of rejected) {
    const event = byId.get(rejection.eventId);
    if (!event || seen.has(rejection.eventId)) continue;
    seen.add(rejection.eventId);
    quarantined.push({ event, code: rejection.code, quarantinedAt });
  }

  return quarantined;
}

export function mergeQuarantined(
  existing: readonly QuarantinedEvent[],
  incoming: readonly QuarantinedEvent[],
): QuarantinedEvent[] {
  const merged = new Map<string, QuarantinedEvent>();
  for (const item of [...existing, ...incoming]) {
    if (!merged.has(item.event.eventId)) {
      merged.set(item.event.eventId, item);
    }
  }
  return [...merged.values()].slice(-QUARANTINE_LIMIT);
}
