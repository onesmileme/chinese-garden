import React, { useEffect } from "react";
import type { GuardianSettingsStore } from "@cc/application";
import { RuntimeContentProvider } from "./content/runtime";
import { guardianSettings } from "./guardian-settings";

export default function App({
  children,
  settings = guardianSettings,
}: {
  children: React.ReactNode;
  settings?: GuardianSettingsStore;
}) {
  useEffect(() => {
    void settings.ready().catch(() => undefined);
  }, [settings]);

  return <RuntimeContentProvider>{children}</RuntimeContentProvider>;
}
