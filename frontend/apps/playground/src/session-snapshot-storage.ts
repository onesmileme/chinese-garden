import type { SnapshotStorage } from "@cc/application";

export const browserSnapshotStorage: SnapshotStorage = {
  read<T>(key: string): T | null {
    let raw: string | null;
    try {
      raw = globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        // Storage may be unavailable even after a successful read.
      }
      return null;
    }
  },

  write<T>(key: string, value: T): void {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is optional in restricted browser environments.
    }
  },

  remove(key: string): void {
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      // Persistence is optional in restricted browser environments.
    }
  },
};
