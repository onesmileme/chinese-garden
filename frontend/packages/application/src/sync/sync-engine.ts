import type { EventQueue } from "../event-queue";
import type { Clock, EventQuarantine, SyncClient } from "../ports";
import {
  normalizeCurrentBatchReceipts,
  toQuarantined,
} from "./rejections";

export async function runSync(deps: {
  queue: EventQueue;
  client: SyncClient;
  quarantine: EventQuarantine;
  clock: Clock;
  getCursor(): number;
  setCursor(n: number): void;
}): Promise<{ pushed: number; pulled: number }> {
  const batch = await deps.queue.takeBatch(100);
  let pushed = 0;
  if (batch.length > 0) {
    const res = await deps.client.push(batch);
    const receipts = normalizeCurrentBatchReceipts(batch, res);
    const confirmed = [...receipts.accepted, ...receipts.duplicated];
    const quarantined = toQuarantined(
      batch,
      receipts.rejected,
      deps.clock.now(),
    );

    await deps.queue.confirm(confirmed);
    pushed = confirmed.length;

    if (quarantined.length > 0) {
      await deps.quarantine.put(quarantined);
      await deps.queue.confirm(
        quarantined.map((item) => item.event.eventId),
      );
    }
  }
  const pull = await deps.client.pull(deps.getCursor(), 100);
  deps.setCursor(pull.nextCursor);
  return { pushed, pulled: pull.events.length };
}
