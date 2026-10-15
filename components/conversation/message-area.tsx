"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import type { Message } from "@/lib/messaging-types";
import { MessageBubble } from "./message-bubble";

interface MessageAreaProps {
  messages: Message[];
  currentUserId: string;
  conversationInitials: string;
  avatarVersion?: number;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onLoadOlder: () => Promise<void>;
  hasMore: boolean;
  pending: boolean;
}

export function MessageArea({ messages, currentUserId, conversationInitials, avatarVersion, onReply, onEdit, onDelete, onDeleteAttachment, onLoadOlder, hasMore, pending }: MessageAreaProps) {
  const area = useRef<HTMLDivElement>(null);
  const previous = useRef({ first: "", last: "", height: 0 });
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const first = messages[0]?.id ?? "";
    const last = messages.at(-1)?.id ?? "";
    if (previous.current.last === last && previous.current.first !== first) {
      element.scrollTop += element.scrollHeight - previous.current.height;
    } else if (previous.current.last !== last) element.scrollTop = element.scrollHeight;
    previous.current = { first, last, height: element.scrollHeight };
  }, [messages]);

  return (
    <div ref={area} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" aria-label="Messages">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {hasMore && <button disabled={pending} onClick={onLoadOlder} className="mx-auto rounded-lg border bg-background px-4 py-2 text-xs disabled:opacity-50">{pending ? "Please wait…" : "Load older messages"}</button>}
        {!messages.length && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Send the first message.</p>}
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {(index === 0 || messages[index - 1].createdAt.slice(0, 10) !== message.createdAt.slice(0, 10)) && (
              <div className="flex justify-center py-2"><time dateTime={message.createdAt.slice(0, 10)} className="rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm">{message.createdAt.slice(0, 10)}</time></div>
            )}
            <MessageBubble message={message} isOwn={message.senderId === currentUserId} senderInitials={conversationInitials} avatarVersion={avatarVersion}
              onReply={onReply} onEdit={onEdit} onDelete={onDelete} onDeleteAttachment={onDeleteAttachment} pending={pending} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
