const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const FNV_OFFSET = 0x6c62272e07bb014262b821756295c58dn;
const FNV_PRIME = 0x0000000001000000000000000000013bn;

function stableEventId(input: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(128, hash * FNV_PRIME);
  }

  let encoded = "";
  for (let index = 0; index < 26; index += 1) {
    encoded = CROCKFORD[Number(hash & 31n)]! + encoded;
    hash >>= 5n;
  }
  return encoded;
}

export function stableAnswerEventId(
  sessionId: string,
  clientSequence: number,
): string {
  return stableEventId(`${sessionId}:${clientSequence}`);
}

export function stableChallengeAnswerEventId(
  challengeId: string,
  participant: "CHILD" | "PARENT",
  questionIndex: number,
): string {
  return stableEventId(
    `challenge-answer:${challengeId}:${participant}:${questionIndex}`,
  );
}

export function stableChallengeCompletedEventId(challengeId: string): string {
  return stableEventId(`challenge-completed:${challengeId}`);
}

export function stableSettlementEventId(sessionId: string): string {
  return stableEventId(`settlement:${sessionId}`);
}
