import { createTaroPlatform } from "./create-platform";
import type { Platform } from "./types";

export function createWeappPlatform(): Platform {
  return createTaroPlatform();
}
