import type { EventQueue } from "../event-queue";
import type { Clock, EventQuarantine, SyncClient } from "../ports";
import { runSync } from "./sync-engine";

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

export interface SyncCursorStore {
  read(principalId: string): Promise<number | null>;
  write(principalId: string, cursor: number): Promise<void>;
}

export interface SyncScheduler {
  delay(ms: number): Promise<void>;
  isRetriable(error: unknown): boolean;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export interface SyncCoordinator {
  start(): Promise<SyncResult | null>;
  syncNow(): Promise<SyncResult | null>;
  dispose(): void;
}

export interface SyncCoordinatorDependencies {
  queue: EventQueue;
  client: SyncClient;
  quarantine: EventQuarantine;
  clock: Clock;
  cursorStore: SyncCursorStore;
  scheduler: SyncScheduler;
  principal(): Promise<string | null>;
}

export function createSyncCoordinator(
  deps: SyncCoordinatorDependencies,
): SyncCoordinator {
  let unsubscribe: (() => void) | null = null;
  let inFlight: Promise<SyncResult | null> | null = null;
  let rerunRequested = false;

  const runAttempt = async (principalId: string): Promise<SyncResult> => {
    let cursor = (await deps.cursorStore.read(principalId)) ?? 0;
    const result = await runSync({
      queue: deps.queue,
      client: deps.client,
      quarantine: deps.quarantine,
      clock: deps.clock,
      getCursor: () => cursor,
      setCursor: (nextCursor) => {
        cursor = nextCursor;
      },
    });
    await deps.cursorStore.write(principalId, cursor);
    return result;
  };

  const runWithRetries = async (
    principalId: string,
    attempt: number,
  ): Promise<SyncResult> => {
    try {
      return await runAttempt(principalId);
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !deps.scheduler.isRetriable(error)) {
        throw error;
      }
      await deps.scheduler.delay(delay);
      return runWithRetries(principalId, attempt + 1);
    }
  };

  const runForCurrentPrincipal = async (): Promise<SyncResult | null> => {
    const principalId = await deps.principal();
    if (principalId === null) return null;
    return runWithRetries(principalId, 0);
  };

  const drainRequestedSyncs = async (): Promise<SyncResult | null> => {
    const total: SyncResult = { pushed: 0, pulled: 0 };
    let ran = false;
    do {
      rerunRequested = false;
      const result = await runForCurrentPrincipal();
      if (result === null) return ran ? total : null;
      ran = true;
      total.pushed += result.pushed;
      total.pulled += result.pulled;
    } while (rerunRequested);
    return total;
  };

  const syncNow = (): Promise<SyncResult | null> => {
    if (inFlight) return inFlight;

    const pending = drainRequestedSyncs().finally(() => {
      if (inFlight === pending) {
        inFlight = null;
      }
    });
    inFlight = pending;
    return pending;
  };

  return {
    start() {
      unsubscribe ??= deps.queue.subscribeEnqueued(() => {
        if (inFlight) {
          rerunRequested = true;
        }
        void syncNow().catch(() => {});
      });
      return syncNow();
    },
    syncNow,
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
