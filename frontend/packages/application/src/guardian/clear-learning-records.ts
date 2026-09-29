import type {
  ClearableEventQuarantine,
  ClearableEventStore,
} from "../ports";
import type { SessionState } from "../session/session-state";

export interface ClearLearningRecordsInput {
  session: SessionState;
  events: ClearableEventStore;
  quarantine: ClearableEventQuarantine;
}

export async function clearLearningRecords({
  session,
  events,
  quarantine,
}: ClearLearningRecordsInput): Promise<void> {
  await events.clear();
  await quarantine.clear();
  session.clearLearningRecords();
}
