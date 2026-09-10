import { EventQueue, type LearningEvent } from "@cc/application";
import {
  clock,
  createBrowserEventQuarantine,
  createBrowserEventStore,
  idGen,
} from "./mock/platform";

const eventStore = createBrowserEventStore();

export const eventQueue = new EventQueue(eventStore);
export const eventQuarantine = createBrowserEventQuarantine();

export function allEvents(): Promise<LearningEvent[]> {
  return eventStore.all();
}

export { clock, idGen };
