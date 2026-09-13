"use client";

import { MoreVertical, Phone, Search, Video } from "lucide-react";
import { EmptyChatState } from "./empty-chat-state";


export function ChatWindow() {
  return (
    <section className="hidden min-w-0 flex-1 flex-col bg-muted/20 md:flex">
      {/* Chat header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <div className="flex size-10 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-600">
              SJ
            </div>

            <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Sarah Johnson</h2>

            <p className="text-xs text-emerald-500">Online</p>
          </div>
        </div>

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
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Phone className="size-5" />
          </button>

          <button
            type="button"
            aria-label="Start video call"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Video className="size-5" />
          </button>

          <button
            type="button"
            aria-label="More options"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="size-5" />
          </button>
        </div>
      </header>

      <EmptyChatState />
    </section>
  );
}
