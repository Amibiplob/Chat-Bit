"use client";

import { NavigationLink as Link } from "@/components/navigation/navigation-link";
import { useSettings } from "./settings-provider";
import { Avatar } from "@/components/profile/avatar";
import {
  Bell,
  ChevronLeft,
  Lock,
  Palette,
  Shield,
  User,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { SettingsSection } from "./settings-layout";

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

const sections: {
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Your personal information",
    icon: UserRound,
  },
  {
    id: "account",
    label: "Account",
    description: "Manage your account",
    icon: User,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and interface",
    icon: Palette,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Notification preferences",
    icon: Bell,
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Control your privacy",
    icon: Lock,
  },
  {
    id: "security",
    label: "Security",
    description: "Password and sessions",
    icon: Shield,
  },
];

export function SettingsSidebar({
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  const {profile}=useSettings();
  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-muted/20 md:w-64 md:border-r">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <Link
          href="/chat"
          aria-label="Back to ChatBit"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>

        <div>
          <h1 className="text-sm font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Manage your preferences
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex gap-1 overflow-x-auto p-3 md:block md:flex-1 md:space-y-1">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSectionChange(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-3 md:w-full rounded-xl px-3 py-3 text-left transition-colors",
                active
                  ? "bg-teal-600/10 text-teal-700 dark:text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-teal-600/10" : "bg-background",
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {section.label}
                </span>

                <span className="mt-0.5 hidden truncate text-xs md:block text-muted-foreground">
                  {section.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="hidden items-center gap-3 border-t p-4 md:flex"><Avatar userId={profile.id} name={profile.displayName} version={profile.avatarVersion}/><span className="truncate text-sm">{profile.displayName}</span></div>
    </aside>
  );
}
