"use client";

import { Phone, Search, Video } from "lucide-react";

interface CallsHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function CallsHeader({ search, onSearchChange }: CallsHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="flex h-16 items-center justify-between gap-4 px-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Calls</h1>
          <p className="text-xs text-muted-foreground">
            Your recent voice and video calls
          </p>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            title="Start voice call"
            className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Phone className="size-4" />
          </button>

          <button
            type="button"
            title="Start video call"
            className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Video className="size-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search calls..."
            aria-label="Search calls"
            className="h-10 w-full rounded-lg border bg-muted/30 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500 focus:bg-background"
          />
        </div>
      </div>
    </header>
  );
}
