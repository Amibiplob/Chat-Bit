"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { longPress } from '@/lib/touch-actions.mjs';
import {
  Check,
  CheckCheck,
  Copy,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
  Star,
} from "lucide-react";

import { Avatar } from "@/components/profile/avatar";
import type { Message } from "@/lib/messaging-types";
import { AttachmentView } from "@/components/media/attachment-view";

interface MessageBubbleProps {
  message: Message;
  saved: boolean;
  onToggleSaved: () => void;
  pending: boolean;
  isOwn: boolean;
  senderInitials: string;
  avatarVersion?: number;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onRetry: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onDeleteAttachment: (attachmentId: string) => void;
}

export function MessageBubble({
  saved, onToggleSaved, message,
  pending,
  isOwn,
  avatarVersion,
  onReply,
  onEdit,
  onRetry, onDelete,
  onDeleteAttachment,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const press = useMemo(() => longPress(() => setMenuOpen(true)), []);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => () => press.stop(), [press]);
  useEffect(() => { if (menuOpen) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [menuOpen]);

  async function handleCopy() {
    try { await navigator.clipboard.writeText(message.content); setMenuOpen(false); }
    catch { setCopyError("Could not copy the message."); }
  }

  return (
    <div data-message-delivery={message.delivery ?? message.status} className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[88%] items-end gap-2 sm:max-w-[75%] ${
          isOwn ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Other user's avatar */}
        {!isOwn && (
          <Avatar userId={message.senderId} name={message.senderName} version={avatarVersion} className="mb-1 size-8"/>
        )}

        <div className="relative min-w-0" tabIndex={0} role="group"
          onPointerDown={event=>{if(!pending && !message.deleted && !message.delivery && !(event.target as HTMLElement).closest('button,a,video,audio,input'))press.start(event);}}
          onPointerMove={press.move} onPointerUp={press.stop} onPointerCancel={press.stop} onPointerLeave={press.stop}
          onKeyDown={event=>{if(event.key==="Escape") {setMenuOpen(false);event.currentTarget.focus();}else if(event.key==='F10' && event.shiftKey && !message.deleted && !message.delivery){event.preventDefault();setMenuOpen(true);}}} aria-label={`Message from ${message.senderName}`}>
          {/* Action buttons */}
          {!message.deleted && !message.delivery && <div
            className={`absolute bottom-full z-10 mb-1 hidden items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm sm:group-hover:flex sm:group-focus-within:flex ${
              isOwn ? "right-0" : "left-0"
            }`}
          >
            <button
              type="button"
              disabled={pending}
              title="Reply" aria-label="Reply"
              onClick={() => onReply(message)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Reply className="size-3.5" />
            </button>

            <button
              type="button"
              disabled={pending}
              title="Copy" aria-label="Copy message"
              onClick={handleCopy}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>

            {isOwn && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  title="Edit" aria-label="Edit message"
                  onClick={() => onEdit(message)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>

                <button
                  type="button"
                  disabled={pending}
                  title="Delete" aria-label="Delete message"
                  onClick={() => onDelete(message.id)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              disabled={pending}
              title="More" aria-label="More message actions" aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>}

          {/* More menu */}
          {menuOpen && !message.deleted && !message.delivery && (
            <div
              ref={menu}
              className={`relative z-20 mb-1 w-40 rounded-xl border bg-card p-1 shadow-lg sm:absolute sm:bottom-full ${
                isOwn ? "right-0" : "left-0"
              }`}
            >
              <button
                type="button"
                disabled={pending}
                onClick={handleCopy}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <Copy className="size-3.5" />
                Copy
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onReply(message);
                  setMenuOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <Reply className="size-3.5" />
                Reply
              </button>
              {isOwn && <>
                <button type="button" disabled={pending} onClick={() => { onEdit(message); setMenuOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted">
                  <Pencil className="size-3.5" />Edit
                </button>
                <button type="button" disabled={pending} onClick={() => { onDelete(message.id); setMenuOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-muted hover:text-destructive">
                  <Trash2 className="size-3.5" />Delete
                </button>
              </>}
            </div>
          )}

          {!message.deleted && !message.delivery && <button type="button" aria-label={saved?"Unsave message on this device":"Save message on this device"} aria-pressed={saved} onClick={onToggleSaved} className="mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"><Star className={`size-3.5 ${saved?"fill-current text-primary":""}`}/>{saved?"Saved":"Save"}</button>}
          {copyError && <p role="alert" className="text-xs text-destructive">{copyError}</p>}
          {/* Message bubble */}
          <div
            className={
              isOwn
                ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
                : "rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 text-sm shadow-sm"
            }
          >
            {!message.deleted && message.attachments.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} own={isOwn} pending={pending} onDelete={() => onDeleteAttachment(attachment.id)} />)}
            {!message.deleted && message.reply && <blockquote className="mb-2 rounded border-l-2 border-current bg-black/5 px-2 py-1 text-xs"><p className="font-medium">{message.reply.senderName}</p><p className="line-clamp-2">{message.reply.deleted ? "Message deleted" : message.reply.content}</p></blockquote>}
            <p className="whitespace-pre-wrap wrap-break-word leading-6">
              {message.deleted ? "Message deleted" : message.content}
            </p>

            <div
              className={`mt-1 flex items-center justify-end gap-1 ${
                isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}
            >
              {!message.deleted && !message.delivery && <button type="button" disabled={pending} aria-label="Message actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="mr-auto flex size-9 items-center justify-center rounded sm:hidden"><MoreHorizontal className="size-3.5" /></button>}
              <time dateTime={message.createdAt} title={message.createdAt} suppressHydrationWarning className="text-[10px]">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>

              {message.edited && <span className="text-[10px]">edited</span>}

              {message.delivery === "sending" && <span role="status" className="text-[10px]">Sending…</span>}
              {message.delivery === "failed" && <><span role="alert" className="text-[10px] text-destructive">Not sent</span><button aria-label="Retry message" onClick={()=>onRetry(message)} className="min-h-11 px-2 text-xs underline">Retry</button></>}
              {isOwn && !message.delivery &&
                (message.status === "read" ? (
                  <CheckCheck aria-label="Read" className="size-3" />
                ) : (
                  <Check aria-label="Sent" className="size-3" />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
