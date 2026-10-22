"use client";

import { ArrowLeft, History, Phone, RefreshCw, Video } from "lucide-react";
import { useCalling } from "@/components/calls/calling-provider";
import { NavigationLink as Link } from "@/components/navigation/navigation-link";
import { Avatar } from "@/components/profile/avatar";
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
  const calling = useCalling();
  const busy = calling.state.working || Boolean(calling.state.call && ["ringing", "connecting", "active"].includes(calling.state.call.status));
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between border-b bg-card px-2 pt-[env(safe-area-inset-top)] md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile back button */}
        <Link
          href="/chat"
          aria-label="Back to conversations"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>

        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar userId={conversation.participantId} name={conversation.name} version={conversation.avatarVersion}/>
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
      <div className="flex shrink-0 items-center gap-0 md:gap-1">
        <Link href="/calls" aria-label="Call history" title="Call history" className="hidden size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:flex"><History className="size-5" /></Link>
        <button
          type="button"
          aria-label="Refresh messages"
          title="Refresh messages"
          disabled={pending}
          onClick={onRefresh}
          className="hidden size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
        >
          <RefreshCw className={`size-5 ${pending ? "animate-spin" : ""}`} />
        </button>

        <button
          type="button"
          aria-label="Start audio call"
          disabled={busy}
          onClick={() => calling.start(conversation.id, "voice")}
          title="Start audio call"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Phone className="size-5" />
        </button>

        <button
          type="button"
          aria-label="Start video call"
          disabled={busy}
          onClick={() => calling.start(conversation.id, "video")}
          title="Start video call"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Video className="size-5" />
        </button>

        <Link href="/help" aria-label="Conversation help" className="hidden size-11 items-center justify-center rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted sm:flex">?</Link>
      </div>
    </header>
  );
}
