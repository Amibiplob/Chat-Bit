"use client";

import { MessageCirclePlus, Search, SlidersHorizontal } from "lucide-react";
import { ConversationList } from "./conversation-list";

export function ConversationSidebar() {
  return (
    <aside className="flex w-full max-w-90 shrink-0 flex-col border-r bg-background">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Chats</h1>

          <p className="text-xs text-muted-foreground">Stay connected</p>
        </div>

        <button
          type="button"
          aria-label="New conversation"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageCirclePlus className="size-5" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b px-4 py-3">
        <div className="flex h-10 items-center rounded-lg bg-muted/60 px-3">
          <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />

          <input
            type="search"
            placeholder="Search conversations..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />

          <button
            type="button"
            aria-label="Search filters"
            className="ml-2 text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto border-b px-4 py-3">
        <button
          type="button"
          className="shrink-0 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white"
        >
          All
        </button>

        <button
          type="button"
          className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Unread
        </button>

        <button
          type="button"
          className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Groups
        </button>
      </div>

      <ConversationList />
    </aside>
  );
}
