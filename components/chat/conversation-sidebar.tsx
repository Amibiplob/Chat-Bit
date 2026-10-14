"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { PersistentConversationList } from "./persistent-conversation-list";
import { NewConversation } from "./new-conversation";
import type { Conversation } from "@/lib/messaging-types";
import { LogoutButton } from "@/components/auth/logout-button";
import type { ConnectionStatus } from "@/lib/realtime-types";

export function ConversationSidebar({ conversations, status }: { conversations: Conversation[]; status: ConnectionStatus }) {
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const filtered = conversations.filter((conversation) => (!unreadOnly || conversation.unread > 0) && `${conversation.name} ${conversation.lastMessage ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r bg-background md:w-90">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Chats</h1>

          <p role="status" className="text-xs text-muted-foreground">{status === "connected" ? "Stay connected" : status === "connecting" ? "Connecting…" : status === "offline" ? "Updates paused" : "Reconnecting…"}</p>
        </div>

        <NewConversation />
      </div>

      {/* Search */}
      <div className="border-b px-4 py-3">
        <div className="flex h-10 items-center rounded-lg bg-muted/60 px-3">
          <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />

          <input
            type="search"
            aria-label="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />

        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto border-b px-4 py-3">
        <button
          type="button"
          aria-pressed={!unreadOnly}
          onClick={() => setUnreadOnly(false)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${!unreadOnly ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
        >
          All
        </button>

        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly(true)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${unreadOnly ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
        >
          Unread
        </button>

      </div>

      <PersistentConversationList conversations={filtered} />
      <div className="border-t p-3 md:hidden">
        <LogoutButton />
      </div>
    </aside>
  );
}
