"use client";

import { useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
} from "lucide-react";

import type { Message } from "./conversation-data";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setMenuOpen(false);
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
            SJ
          </div>
        )}

        <div className="relative min-w-0">
          {/* Action buttons */}
          <div
            className={`absolute bottom-full z-10 mb-1 hidden items-center gap-0.5 rounded-lg border bg-background p-1 shadow-sm group-hover:flex ${
              isOwn ? "right-0" : "left-0"
            }`}
          >
            <button
              type="button"
              title="Reply"
              onClick={() => onReply(message)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Reply className="size-3.5" />
            </button>

            <button
              type="button"
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
                  title="Edit"
                  onClick={() => onEdit(message)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>

                <button
                  type="button"
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
              title="More"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </div>

          {/* More menu */}
          {menuOpen && (
            <div
              className={`absolute bottom-full z-20 mb-1 w-32 rounded-lg border bg-background p-1 shadow-lg ${
                isOwn ? "right-0" : "left-0"
              }`}
            >
              <button
                type="button"
                onClick={handleCopy}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Copy className="size-3.5" />
                Copy
              </button>

              <button
                type="button"
                onClick={() => {
                  onReply(message);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <Reply className="size-3.5" />
                Reply
              </button>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={
              isOwn
                ? "rounded-2xl rounded-br-md bg-blue-500 px-4 py-2.5 text-sm text-white shadow-sm"
                : "rounded-2xl rounded-bl-md border bg-background px-4 py-2.5 text-sm shadow-sm"
            }
          >
            <p className="whitespace-pre-wrap wrap-break-word leading-6">
              {message.content}
            </p>

            <div
              className={`mt-1 flex items-center justify-end gap-1 ${
                isOwn ? "text-blue-100" : "text-muted-foreground"
              }`}
            >
              <span className="text-[10px]">{message.createdAt}</span>

              {message.edited && <span className="text-[10px]">edited</span>}

              {isOwn &&
                (message.status === "read" ? (
                  <CheckCheck className="size-3" />
                ) : (
                  <Check className="size-3" />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
