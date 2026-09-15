"use client";

import { useState } from "react";
import { SettingsSidebar } from "./settings-sidebar";

export type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "privacy"
  | "security";

export function SettingsLayout() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("profile");

  return (
    <main className="flex min-h-svh bg-background">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
    </main>
  );
}
