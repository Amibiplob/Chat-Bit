"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/messaging-types";

// The original conversation-list.tsx has an unrelated user edit and is preserved.
export function PersistentConversationList({ conversations }: { conversations: Conversation[] }) {
  const pathname = usePathname();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversations">
      {!conversations.length && <p className="p-5 text-sm text-muted-foreground">No conversations found. Start a conversation with another user.</p>}
      {conversations.map((conversation) => (
        <Link key={conversation.id} href={`/chat/${conversation.id}`} aria-current={pathname === `/chat/${conversation.id}` ? "page" : undefined}
          className={cn("flex w-full gap-3 border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/50", pathname === `/chat/${conversation.id}` && "bg-muted/40")}>
          <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold", conversation.color)}>{conversation.initials}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{conversation.name}</p>
              <time dateTime={conversation.updatedAt} suppressHydrationWarning className={cn("shrink-0 text-[11px]", conversation.unread ? "font-medium text-blue-500" : "text-muted-foreground")}>
                {new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </time>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage ?? "Start the conversation"}</p>
              {conversation.unread > 0 && <span aria-label={`${conversation.unread} unread messages`} className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">{conversation.unread}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
