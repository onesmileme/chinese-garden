import {
  EventQueue,
  clearLearningRecords,
  type LearningEvent,
} from "@cc/application";
import {
  clock,
  createBrowserEventQuarantine,
  createBrowserEventStore,
  idGen,
} from "./mock/platform";
import { sessionState } from "./session-state";

const eventStore = createBrowserEventStore();

export const eventQueue = new EventQueue(eventStore);
export const eventQuarantine = createBrowserEventQuarantine();

export function allEvents(): Promise<LearningEvent[]> {
  return eventStore.all();
}

export function clearBrowserLearningRecords(): Promise<void> {
  return clearLearningRecords({
    session: sessionState,
    events: eventStore,
    quarantine: eventQuarantine,
  });
}

export { clock, idGen };
