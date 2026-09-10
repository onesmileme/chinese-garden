import type { LearningEvent } from "./events";

export interface Clock {
  now(): number;
}
export interface IdGen {
  ulid(): string;
}

export interface EventStore {
  append(event: LearningEvent): Promise<void>;
  pending(limit: number): Promise<LearningEvent[]>;
  ack(eventIds: string[]): Promise<void>;
  all(): Promise<LearningEvent[]>;
}

export type SyncRejectionCode =
  | "INVALID_ENVELOPE"
  | "UNAUTHORIZED_CHILD"
  | "UNSUPPORTED_PAYLOAD_VERSION"
  | "INVALID_PAYLOAD"
  | "CONTENT_VERSION_UNAVAILABLE"
  | "ANSWER_MISMATCH"
  | "DUPLICATE_SEMANTIC_ATTEMPT";

export interface RejectedEvent {
  eventId: string;
  code: SyncRejectionCode;
}

export interface QuarantinedEvent {
  event: LearningEvent;
  code: SyncRejectionCode;
  quarantinedAt: number;
}

export interface EventQuarantine {
  put(events: readonly QuarantinedEvent[]): Promise<void>;
  all(): Promise<readonly QuarantinedEvent[]>;
}

export interface PushResult {
  accepted: string[];
  duplicated: string[];
  rejected: RejectedEvent[];
  serverOffset: number;
}
export interface PullResult {
  events: LearningEvent[];
  nextCursor: number;
}

export interface SyncClient {
  push(events: LearningEvent[]): Promise<PushResult>;
  pull(cursor: number, limit: number): Promise<PullResult>;
}
