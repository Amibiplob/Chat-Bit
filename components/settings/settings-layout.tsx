"use client";

import { useState } from "react";
import { SettingsSidebar } from "./settings-sidebar";
import { ProfileSettings } from "./profile-settings";
import { AccountSettings } from "./account-settings";
import { AppearanceSettings } from "./appearance-settings";
import { NotificationSettings } from "./notification-settings";
import { PrivacySettings } from "./privacy-settings";
import { SecuritySettings } from "./security-settings";
import type { AuthUser } from "@/lib/auth-types";

export type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "privacy"
  | "security";

export function SettingsLayout({ user }: { user: AuthUser }) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("profile");

  function renderSection() {
    switch (activeSection) {
      case "profile":
        return <ProfileSettings />;

      case "account":
        return <AccountSettings user={user} />;

      case "appearance":
        return <AppearanceSettings />;

      case "notifications":
        return <NotificationSettings />;

      case "privacy":
        return <PrivacySettings />;

      case "security":
        return <SecuritySettings />;

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
