import { describe, expect, it, vi } from "vitest";
import type { LearningEventContract } from "@cc/content-schema";
import {
  SyncProtocolError,
  createSyncClient,
} from "../src/sync";
import type { HttpClient } from "../src/http";

const event: LearningEventContract = {
  eventId: "00000000000000000000000000",
  childProfileId: "child-1",
  deviceId: "device-1",
  sessionId: "session-1",
  eventType: "DAY_SETTLED",
  clientSequence: 1,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: 1_000,
  payload: {
    xpAwarded: 10,
    accuracyBonus: 2,
    firstCorrectRate: 0.8,
  },
};

describe("createSyncClient", () => {
  it("pushes events and parses structured receipts", async () => {
    const post = vi.fn(async () => ({
      accepted: [event.eventId],
      duplicated: [],
      rejected: [{ eventId: "rejected-1", code: "INVALID_PAYLOAD" }],
      serverOffset: 12,
    }));
    const http = { get: vi.fn(), post } as unknown as HttpClient;

    const result = await createSyncClient(http).push([event]);

    expect(result).toEqual({
      accepted: [event.eventId],
      duplicated: [],
      rejected: [{ eventId: "rejected-1", code: "INVALID_PAYLOAD" }],
      serverOffset: 12,
    });
    expect(post).toHaveBeenCalledWith("/v1/sync/push", { events: [event] });
  });

  it("pulls events with encoded cursor parameters", async () => {
    const get = vi.fn(async () => ({
      events: [event],
      nextCursor: 42,
    }));
    const http = { get, post: vi.fn() } as unknown as HttpClient;

    const result = await createSyncClient(http).pull(17, 100);

    expect(result).toEqual({ events: [event], nextCursor: 42 });
    expect(get).toHaveBeenCalledWith("/v1/sync/pull?cursor=17&limit=100");
  });

  it.each([
    {
      operation: "push",
      response: {
        accepted: [event.eventId],
        duplicated: [],
        rejected: ["legacy-event-id"],
        serverOffset: 12,
      },
    },
    {
      operation: "pull",
      response: {
        events: [{ ...event, eventId: "not-a-ulid" }],
        nextCursor: 42,
      },
    },
  ] as const)(
    "reports malformed $operation responses as protocol errors",
    async ({ operation, response }) => {
      const http = {
        get: vi.fn(async () => response),
        post: vi.fn(async () => response),
      } as unknown as HttpClient;
      const client = createSyncClient(http);
      const request =
        operation === "push"
          ? client.push([event])
          : client.pull(0, 100);

      await expect(request).rejects.toBeInstanceOf(SyncProtocolError);
    },
  );
});
