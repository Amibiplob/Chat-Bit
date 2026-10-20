"use client";

import Link from "next/link";
import { CheckCheck, Pin } from "lucide-react";

import { cn } from "@/lib/utils";
import { conversations } from "@/components/conversation/conversation-data";

export function ConversationList() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/chat/${conversation.id}`}
          className={cn(
            "flex w-full gap-3 border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
            conversation.id === "1" && "bg-muted/40",
          )}
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-full text-sm font-semibold",
                conversation.color,
              )}
            >
              {conversation.initials}
            </div>

            {conversation.online && (
              <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
            )}
          </div>

          {/* Conversation information */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold">
                  {conversation.name}
                </p>

                {conversation.pinned && (
                  <Pin className="size-3 shrink-0 text-muted-foreground" />
                )}
              </div>

              <span
                className={cn(
                  "shrink-0 text-[11px]",
                  conversation.unread > 0
                    ? "font-medium text-blue-500"
                    : "text-muted-foreground",
                )}
              >
                {conversation.time}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                {conversation.message.startsWith("You:") && (
                  <CheckCheck className="size-3.5 shrink-0 text-blue-500" />
                )}

                <p className="truncate text-xs text-muted-foreground">
                  {conversation.message.replace("You: ", "")}
                </p>
              </div>

              {conversation.unread > 0 && (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                  {conversation.unread}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
