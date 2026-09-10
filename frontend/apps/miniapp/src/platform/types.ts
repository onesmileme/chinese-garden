import type {
  EventQuarantine,
  EventStore,
  SnapshotStorage,
} from "@cc/application";
import type { Cue } from "@cc/ui";

export interface Platform {
  storage: EventStore;
  quarantine: EventQuarantine;
  snapshots: SnapshotStorage;
  login(): Promise<{ code: string }>;
  cue(cue: Cue): void;
}
