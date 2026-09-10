import {
  EventQueue,
  type Clock,
  type IdGen,
} from "@cc/application";
import { platform } from "./platform";

export const eventQueue = new EventQueue(platform.storage);

export const clock: Clock = {
  now: () => Date.now(),
};

let sequence = 0;
export const idGen: IdGen = {
  ulid: () => {
    sequence += 1;
    const time = Date.now().toString(36).toUpperCase().padStart(10, "0");
    const random = Math.floor(Math.random() * 0xffffff)
      .toString(36)
      .toUpperCase()
      .padStart(5, "0");
    return `${time}${sequence.toString(36).toUpperCase().padStart(3, "0")}${random}`;
  },
};
