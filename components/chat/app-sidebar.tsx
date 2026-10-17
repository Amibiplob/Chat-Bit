"use client";

import Link from "next/link";
import { MessageCircle, Phone, Settings, Users, FolderOpen } from "lucide-react";
import { Avatar } from "@/components/profile/avatar";
import { useSettings } from "@/components/settings/settings-provider";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/auth/logout-button";
import type { AuthUser } from "@/lib/auth-types";

interface AppSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  user: AuthUser;
  hasUnread: boolean;
}

const navigation = [
  { id: "shared", label: "Shared files", icon: FolderOpen },
  {
    id: "chats",
    label: "Chats",
    icon: MessageCircle,
  },
  {
    id: "calls",
    label: "Calls",
    icon: Phone,
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: Users,
  },
];

export function AppSidebar({
  activeSection,
  onSectionChange,
  user,
  hasUnread,
}: AppSidebarProps) {
  const {profile}=useSettings();
  return (
    <aside className="hidden w-18 shrink-0 flex-col border-r bg-muted/20 md:flex">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b">
        <Link
          href="/"
          aria-label="ChatBit home"
          className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white shadow-sm transition-transform hover:scale-105"
        >
          C
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-2 py-5">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onSectionChange(item.id)}
              title={item.label}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-xl transition-colors",
                active
                  ? "bg-teal-600/10 text-teal-600"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" />

              {item.id === "chats" && hasUnread && (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-teal-600" />
              )}
            </button>
          );
        })}

        <div className="my-2 h-px w-8 bg-border" />

        <Link
          href="/settings"
          title="Settings" aria-label="Settings"
          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-5" />
        </Link>
      </nav>

      {/* Current user */}
      <div className="border-t p-3">
        <Link href="/settings" aria-label={`Profile for ${profile.displayName}`}><Avatar userId={user.id} name={profile.displayName} version={profile.avatarVersion} className="size-11"/></Link>
        <LogoutButton compact />
      </div>
    </aside>
  );
}
