"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
} from "lucide-react";

import type { Message } from "@/lib/messaging-types";
import type { Attachment } from "@/lib/attachment-types";
import { messagingRequest } from "@/lib/messaging-client";

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function AttachmentView({ attachment, own, pending, onDelete }: { attachment: Attachment; own: boolean; pending: boolean; onDelete: () => void }) {
  const media = /^(image|video|audio)\//.test(attachment.mimeType);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!media) return;
    const controller = new AbortController();
    messagingRequest<{ url: string }>(`/api/attachments/${attachment.id}/download`, { signal: controller.signal })
      .then((value) => setUrl(value.url)).catch(() => { if (!controller.signal.aborted) setError("Preview unavailable"); });
    return () => controller.abort();
  }, [attachment.id, media]);
  async function download() {
    try {
      const value = await messagingRequest<{ url: string }>(`/api/attachments/${attachment.id}/download?download=1`);
      window.location.assign(value.url);
    } catch { setError("Download unavailable"); }
  }
  return <div className="mb-2 overflow-hidden rounded-xl border border-current/15 bg-black/5">
    {media && !url && <div className="flex h-20 items-center justify-center text-xs opacity-70">{error || "Loading preview…"}</div>}
    {/* Private authenticated media requires a native image request. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && attachment.mimeType.startsWith("image/") && <img onError={() => setError("Preview unavailable")} src={url} alt={attachment.filename} className="max-h-72 w-full object-contain" />}
    {url && attachment.mimeType.startsWith("video/") && <video onError={() => setError("Preview unavailable")} src={url} controls preload="metadata" className="max-h-72 w-full" />}
    {url && attachment.mimeType.startsWith("audio/") && <audio onError={() => setError("Preview unavailable")} src={url} controls preload="metadata" className="w-full p-2" />}
    <div className="flex items-center gap-2 p-2.5"><FileText className="size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{attachment.filename}</p><p className="text-[10px] opacity-70">{readableBytes(attachment.byteSize)}</p></div>
      <button type="button" disabled={pending} onClick={download} aria-label="Download file" title="Download file" className="rounded p-1 hover:bg-black/10"><Download className="size-4" /></button>
      {own && <button type="button" disabled={pending} onClick={onDelete} aria-label="Delete attachment" title="Delete attachment" className="rounded p-1 hover:bg-black/10"><Trash2 className="size-4" /></button>}
    </div>{error && <p role="alert" className="px-2 pb-2 text-[10px]">{error}</p>}
  </div>;
}

interface MessageBubbleProps {
  message: Message;
  pending: boolean;
  isOwn: boolean;
  senderInitials: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onDeleteAttachment: (attachmentId: string) => void;
}

export function MessageBubble({
  message,
  pending,
  isOwn,
  senderInitials,
  onReply,
  onEdit,
  onDelete,
  onDeleteAttachment,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function handleCopy() {
    try { await navigator.clipboard.writeText(message.content); setMenuOpen(false); }
    catch { setCopyError("Could not copy the message."); }
  }

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[88%] items-end gap-2 sm:max-w-[75%] ${
          isOwn ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Other user's avatar */}
        {!isOwn && (
          <div className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-600">
            {senderInitials}
          </div>
        )}

        <div className="relative min-w-0" tabIndex={0} role="group" aria-label={`Message from ${message.senderName}`}>
          {/* Action buttons */}
          {!message.deleted && <div
            className={`absolute bottom-full z-10 mb-1 hidden items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm sm:group-hover:flex sm:group-focus-within:flex ${
              isOwn ? "right-0" : "left-0"
            }`}
          >
            <button
              type="button"
              disabled={pending}
              title="Reply"
              onClick={() => onReply(message)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Reply className="size-3.5" />
            </button>

            <button
              type="button"
              disabled={pending}
              title="Copy"
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
                  title="Edit"
                  onClick={() => onEdit(message)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>

                <button
                  type="button"
                  disabled={pending}
                  title="Delete"
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
              title="More"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>}

          {/* More menu */}
          {menuOpen && !message.deleted && (
            <div
              className={`absolute bottom-full z-20 mb-1 w-32 rounded-lg border bg-background p-1 shadow-lg ${
                isOwn ? "right-0" : "left-0"
              }`}
            >
              <button
                type="button"
                disabled={pending}
                onClick={handleCopy}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
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
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Reply className="size-3.5" />
                Reply
              </button>
              {isOwn && <>
                <button type="button" disabled={pending} onClick={() => { onEdit(message); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
                  <Pencil className="size-3.5" />Edit
                </button>
                <button type="button" disabled={pending} onClick={() => { onDelete(message.id); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted hover:text-destructive">
                  <Trash2 className="size-3.5" />Delete
                </button>
              </>}
            </div>
          )}

          {copyError && <p role="alert" className="text-xs text-destructive">{copyError}</p>}
          {/* Message bubble */}
          <div
            className={
              isOwn
                ? "rounded-2xl rounded-br-md bg-blue-500 px-4 py-2.5 text-sm text-white shadow-sm"
                : "rounded-2xl rounded-bl-md border bg-background px-4 py-2.5 text-sm shadow-sm"
            }
          >
            {!message.deleted && message.attachments.map((attachment) => <AttachmentView key={attachment.id} attachment={attachment} own={isOwn} pending={pending} onDelete={() => onDeleteAttachment(attachment.id)} />)}
            {!message.deleted && message.reply && <blockquote className="mb-2 rounded border-l-2 border-current bg-black/5 px-2 py-1 text-xs"><p className="font-medium">{message.reply.senderName}</p><p className="line-clamp-2">{message.reply.deleted ? "Message deleted" : message.reply.content}</p></blockquote>}
            <p className="whitespace-pre-wrap wrap-break-word leading-6">
              {message.deleted ? "Message deleted" : message.content}
            </p>

            <div
              className={`mt-1 flex items-center justify-end gap-1 ${
                isOwn ? "text-blue-100" : "text-muted-foreground"
              }`}
            >
              {!message.deleted && <button type="button" disabled={pending} aria-label="Message actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="mr-auto flex size-5 items-center justify-center rounded sm:hidden"><MoreHorizontal className="size-3.5" /></button>}
              <time dateTime={message.createdAt} title={message.createdAt} suppressHydrationWarning className="text-[10px]">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>

              {message.edited && <span className="text-[10px]">edited</span>}

              {isOwn &&
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
