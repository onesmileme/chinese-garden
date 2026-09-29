import type { GuardianSettings } from "./settings";

export interface GuardianSettingItem {
  key: keyof GuardianSettings;
  label: string;
  supported: boolean;
  description?: string;
}

export const GUARDIAN_SETTING_ITEMS: readonly GuardianSettingItem[] = [
  {
    key: "backgroundMusicEnabled",
    label: "背景音乐",
    supported: false,
    description: "当前暂无背景音乐资源，暂不支持此设置",
  },
  {
    key: "answerSoundEnabled",
    label: "答题音效",
    supported: true,
  },
  {
    key: "hapticsEnabled",
    label: "震动反馈",
    supported: true,
  },
  {
    key: "eyeProtectionEnabled",
    label: "护眼模式",
    supported: true,
  },
];

export const PARENT_GATE_HOLD_DURATION_MS = 2_000;
