import type {
  AudioPreferencePort,
  ClearableEventQuarantine,
  ClearableEventStore,
  HapticsPreferencePort,
  SnapshotStorage,
  ThemePreferencePort,
} from "@cc/application";
import type { Cue } from "@cc/ui";

export interface Platform {
  storage: ClearableEventStore;
  quarantine: ClearableEventQuarantine;
  snapshots: SnapshotStorage;
  audioPreferences: AudioPreferencePort;
  hapticsPreferences: HapticsPreferencePort;
  themePreferences: ThemePreferencePort;
  login(): Promise<{ code: string }>;
  cue(cue: Cue): void;
}
