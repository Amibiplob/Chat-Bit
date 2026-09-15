"use client";

import Link from "next/link";
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
  return (
    <aside className="hidden w-72 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
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
      <nav className="flex-1 space-y-1 p-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                active
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-blue-500/10" : "bg-background",
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {section.label}
                </span>

                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {section.description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            MB
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Md Biplob Hosain</p>

            <p className="truncate text-xs text-muted-foreground">Online</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
