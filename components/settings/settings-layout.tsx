"use client";

import { useState } from "react";
import { SettingsSidebar } from "./settings-sidebar";
import { ProfileSettings } from "./profile-settings";
import { AccountSettings } from "./account-settings";
import { AppearanceSettings } from "./appearance-settings";
import { NotificationSettings } from "./notification-settings";

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

      case "account":
        return <AccountSettings />;

      case "appearance":
        return <AppearanceSettings />;

      case "notifications":
        return <NotificationSettings />;

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
