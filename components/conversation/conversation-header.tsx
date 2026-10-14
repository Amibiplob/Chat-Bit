"use client";

import { ArrowLeft, MoreVertical, Phone, RefreshCw, Video } from "lucide-react";
import Link from "next/link";
import type { Conversation } from "@/lib/messaging-types";
import type { Presence, ConnectionStatus } from "@/lib/realtime-types";

interface ConversationHeaderProps {
  conversation: Conversation;
  onRefresh: () => Promise<void>;
  pending: boolean;
  presence: Presence | null;
  status: ConnectionStatus;
}

export function ConversationHeader({ conversation, onRefresh, pending, presence, status }: ConversationHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile back button */}
        <Link
          href="/chat"
          aria-label="Back to conversations"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>

        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${conversation.color}`}
          >
            {conversation.initials}
          </div>
          {presence?.online && <span aria-label="Online" className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />}
        </div>

        {/* User information */}
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {conversation.name}
          </h1>

          <p role="status" className="text-xs text-muted-foreground">
            {status !== "connected" ? (status === "connecting" ? "Connecting…" : "Reconnecting…")
              : presence?.typing ? "Typing…" : presence?.online ? "Online"
              : presence?.lastSeen ? <time dateTime={presence.lastSeen} suppressHydrationWarning>Last seen {new Date(presence.lastSeen).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              : "Offline"}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Refresh messages"
          title="Refresh messages"
          disabled={pending}
          onClick={onRefresh}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={`size-5 ${pending ? "animate-spin" : ""}`} />
        </button>

        <button
          type="button"
          aria-label="Start audio call"
          disabled
          title="Not available yet"
          className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Phone className="size-5" />
        </button>

        <button
          type="button"
          aria-label="Start video call"
          disabled
          title="Not available yet"
          className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Video className="size-5" />
        </button>

        <button
          type="button"
          aria-label="More conversation options"
          disabled
          title="Not available yet"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="size-5" />
        </button>
      </div>
    </header>
  );
}
