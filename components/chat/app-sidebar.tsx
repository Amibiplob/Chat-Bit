"use client";

import Link from "next/link";
import { Bell, MessageCircle, Phone, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const navigation = [
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
}: AppSidebarProps) {
  return (
    <aside className="hidden w-18 shrink-0 flex-col border-r bg-muted/20 md:flex">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b">
        <Link
          href="/"
          aria-label="ChatBit home"
          className="flex size-10 items-center justify-center rounded-xl bg-blue-500 text-lg font-bold text-white shadow-sm transition-transform hover:scale-105"
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
              onClick={() => onSectionChange(item.id)}
              title={item.label}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-xl transition-colors",
                active
                  ? "bg-blue-500/10 text-blue-500"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" />

              {item.id === "chats" && (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}

        <div className="my-2 h-px w-8 bg-border" />

        <button
          type="button"
          title="Notifications"
          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" />
        </button>

        <button
          type="button"
          title="Settings"
          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-5" />
        </button>
      </nav>

      {/* Current user */}
      <div className="border-t p-3">
        <button
          type="button"
          title="Your profile"
          className="flex size-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 transition-opacity hover:opacity-80 dark:bg-blue-950 dark:text-blue-300"
        >
          MB
        </button>
      </div>
    </aside>
  );
}
