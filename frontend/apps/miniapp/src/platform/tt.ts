import { createTaroPlatform } from "./create-platform";
import type { Platform } from "./types";

export function createTtPlatform(): Platform {
  return createTaroPlatform();
}
