"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { PersistentConversationList } from "./persistent-conversation-list";
import { NewConversation } from "./new-conversation";
import type { Conversation } from "@/lib/messaging-types";
import { LogoutButton } from "@/components/auth/logout-button";
import type { ConnectionStatus } from "@/lib/realtime-types";
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';

export function ConversationSidebar({ conversations, status }: { conversations: Conversation[]; status: ConnectionStatus }) {
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const filtered = conversations.filter((conversation) => (!unreadOnly || conversation.unread > 0) && `${conversation.name} ${conversation.lastMessage ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r bg-card md:w-90">
      {/* Header */}
      <div className="flex min-h-20 shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chats<span className="ml-2 text-primary">.</span></h1>

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
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          aria-pressed={!unreadOnly}
          onClick={() => setUnreadOnly(false)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-medium ${!unreadOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          All
        </button>

        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly(true)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-medium ${unreadOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          Unread
        </button>
        <Link href="/shared" className="ml-auto flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-primary"><FolderOpen className="size-4"/>Files</Link>

      </div>

      <PersistentConversationList conversations={filtered} />
      <div className="border-t p-3 md:hidden">
        <LogoutButton />
      </div>
    </aside>
  );
}
