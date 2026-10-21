"use client";

import { NavigationLink } from "@/components/navigation/navigation-link";
import { Avatar } from "@/components/profile/avatar";
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
        <NavigationLink prefetch={false} key={conversation.id} href={`/chat/${conversation.id}`} aria-current={pathname === `/chat/${conversation.id}` ? "page" : undefined}
          className={cn("flex min-h-21 w-full gap-3 border-b border-border/60 px-5 py-4 text-left transition-colors hover:bg-accent/60", pathname === `/chat/${conversation.id}` && "bg-accent border-l-4 border-l-primary")}>
          <Avatar userId={conversation.participantId} name={conversation.name} version={conversation.avatarVersion} className="size-12"/>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{conversation.name}</p>
              <time dateTime={conversation.updatedAt} suppressHydrationWarning className={cn("shrink-0 text-[11px]", conversation.unread ? "font-medium text-teal-600" : "text-muted-foreground")}>
                {new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </time>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage ?? "Start the conversation"}</p>
              {conversation.unread > 0 && <span aria-label={`${conversation.unread} unread messages`} className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-semibold text-white">{conversation.unread}</span>}
            </div>
          </div>
        </NavigationLink>
      ))}
    </div>
  );
}
