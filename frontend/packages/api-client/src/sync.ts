import {
  learningEventSchema,
  type LearningEventContract,
} from "@cc/content-schema";
import { z } from "zod";
import type { HttpClient } from "./http";

const rejectionCodeSchema = z.enum([
  "INVALID_ENVELOPE",
  "UNAUTHORIZED_CHILD",
  "UNSUPPORTED_PAYLOAD_VERSION",
  "INVALID_PAYLOAD",
  "CONTENT_VERSION_UNAVAILABLE",
  "ANSWER_MISMATCH",
  "DUPLICATE_SEMANTIC_ATTEMPT",
]);

const pushResultSchema = z
  .object({
    accepted: z.array(z.string()),
    duplicated: z.array(z.string()),
    rejected: z.array(
      z
        .object({
          eventId: z.string(),
          code: rejectionCodeSchema,
        })
        .strict(),
    ),
    serverOffset: z.number().int().nonnegative(),
  })
  .strict();

const pullResultSchema = z
  .object({
    events: z.array(learningEventSchema),
    nextCursor: z.number().int().nonnegative(),
  })
  .strict();

export type PushResult = z.infer<typeof pushResultSchema>;
export type PullResult = z.infer<typeof pullResultSchema>;

export interface SyncClient {
  push(events: LearningEventContract[]): Promise<PushResult>;
  pull(cursor: number, limit: number): Promise<PullResult>;
}

export class SyncProtocolError extends Error {
  constructor(
    public readonly operation: "push" | "pull",
    public readonly validationError: z.ZodError,
  ) {
    super(`invalid sync ${operation} response`);
    this.name = "SyncProtocolError";
  }
}

function parseResponse<T>(
  operation: "push" | "pull",
  schema: z.ZodType<T>,
  response: unknown,
): T {
  const parsed = schema.safeParse(response);
  if (!parsed.success) {
    throw new SyncProtocolError(operation, parsed.error);
  }
  return parsed.data;
}

export function createSyncClient(http: HttpClient): SyncClient {
  return {
    async push(events) {
      const response = await http.post<unknown>("/v1/sync/push", { events });
      return parseResponse("push", pushResultSchema, response);
    },
    async pull(cursor, limit) {
      const query = new URLSearchParams({
        cursor: String(cursor),
        limit: String(limit),
      });
      const response = await http.get<unknown>(
        `/v1/sync/pull?${query.toString()}`,
      );
      return parseResponse("pull", pullResultSchema, response);
    },
  };
}
