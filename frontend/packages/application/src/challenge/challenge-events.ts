import {
  learningEventSchema,
  type ChallengeCompletedPayloadV1,
  type LearningEventContract,
} from "@cc/content-schema";
import type { EventQueue } from "../event-queue";
import type { Clock } from "../ports";
import { stableChallengeCompletedEventId } from "../session/stable-event-id";

export type RecordChallengeCompletedInput = Omit<
  ChallengeCompletedPayloadV1,
  "payloadVersion"
> & {
  childProfileId: string;
  deviceId: string;
  clientSequence: number;
  contentVersion: string;
  ruleVersion: string;
};

export async function recordChallengeCompleted(
  deps: { queue: EventQueue; clock: Clock },
  input: RecordChallengeCompletedInput,
): Promise<LearningEventContract> {
  const now = deps.clock.now();
  if (input.completedAt > now) {
    throw new RangeError("completedAt must not be in the future");
  }

  const event = learningEventSchema.parse({
    eventId: stableChallengeCompletedEventId(input.challengeId),
    childProfileId: input.childProfileId,
    deviceId: input.deviceId,
    sessionId: input.challengeId,
    eventType: "CHALLENGE_COMPLETED",
    clientSequence: input.clientSequence,
    contentVersion: input.contentVersion,
    ruleVersion: input.ruleVersion,
    occurredAt: now,
    payload: {
      payloadVersion: 1,
      challengeId: input.challengeId,
      dimension: input.dimension,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      winner: input.winner,
      child: input.child,
      parent: input.parent,
    },
  });

  const stored = await deps.queue.enqueueOnce(event);
  return learningEventSchema.parse(stored);
}
