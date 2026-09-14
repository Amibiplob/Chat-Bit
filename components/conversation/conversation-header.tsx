"use client";

import { ArrowLeft, MoreVertical, Phone, Search, Video } from "lucide-react";
import type { Conversation } from "./conversation-data";

interface ConversationHeaderProps {
  conversation: Conversation;
}

export function ConversationHeader({ conversation }: ConversationHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile back button */}
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={() => window.history.back()}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>

        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${conversation.color}`}
          >
            {conversation.initials}
          </div>

          {conversation.online && (
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          )}
        </div>

        {/* User information */}
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {conversation.name}
          </h1>

          <p
            className={
              conversation.online
                ? "text-xs text-emerald-500"
                : "text-xs text-muted-foreground"
            }
          >
            {conversation.online
              ? "Online"
              : (conversation.lastSeen ?? "Offline")}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Search messages"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Search className="size-5" />
        </button>

        <button
          type="button"
          aria-label="Start audio call"
          className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Phone className="size-5" />
        </button>

        <button
          type="button"
          aria-label="Start video call"
          className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <Video className="size-5" />
        </button>

        <button
          type="button"
          aria-label="More conversation options"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MoreVertical className="size-5" />
        </button>
      </div>
    </header>
  );
}
