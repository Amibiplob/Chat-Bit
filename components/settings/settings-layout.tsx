"use client";

import { useState } from "react";
import { SettingsSidebar } from "./settings-sidebar";
import { ProfileSettings } from "./profile-settings";

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

  function renderSection() {
    switch (activeSection) {
      case "profile":
        return <ProfileSettings />;

      default:
        return <ProfileSettings />;
    }
  }

  return (
    <main className="flex min-h-svh bg-background">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <section className="min-w-0 flex-1">{renderSection()}</section>
    </main>
  );
}
