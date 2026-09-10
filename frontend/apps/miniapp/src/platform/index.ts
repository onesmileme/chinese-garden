import { createTtPlatform } from "./tt";
import { createWeappPlatform } from "./weapp";
import type { Platform } from "./types";

export const platform: Platform =
  process.env.TARO_ENV === "tt" ? createTtPlatform() : createWeappPlatform();

export * from "./types";
