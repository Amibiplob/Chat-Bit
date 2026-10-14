"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Smile, X } from "lucide-react";

import type { Message } from "@/lib/messaging-types";

interface MessageComposerProps {
  onSend: (content: string) => Promise<boolean>;
  pending: boolean;
  replyingTo: Message | null;
  editingMessage: Message | null;
  onCancel: () => void;
}

const emojis = [
  "😀",
  "😂",
  "😍",
  "👍",
  "❤️",
  "🔥",
  "🎉",
  "👋",
  "😊",
  "😎",
  "🙏",
  "👏",
];

export function MessageComposer({
  onSend,
  pending,
  replyingTo,
  editingMessage,
  onCancel,
}: MessageComposerProps) {
  const [value, setValue] = useState(editingMessage?.content ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingMessage) {
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  async function handleSubmit() {
    const content = value.trim();

    if (!content || pending) {
      return;
    }

    if (await onSend(content)) {
      setValue("");
      setEmojiOpen(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleEmoji(emoji: string) {
    if (pending) return;
    setValue((current) => `${current}${emoji}`);
    textareaRef.current?.focus();
  }

  function handleCancel() {
    setValue("");
    setEmojiOpen(false);
    onCancel();
  }

  return (
    <div className="border-t bg-background p-3 md:p-4">
      {/* Reply / Edit preview */}
      {(replyingTo || editingMessage) && (
        <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0 border-l-2 border-blue-500 pl-3">
            <p className="text-xs font-medium text-blue-500">
              {editingMessage ? "Editing message" : "Replying to"}
            </p>

            <p className="truncate text-xs text-muted-foreground">
              {(editingMessage ?? replyingTo)?.content}
            </p>
          </div>

          <button
            type="button"
            aria-label="Cancel"
            disabled={pending}
            onClick={handleCancel}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="relative mx-auto max-w-3xl">
        {/* Emoji picker */}
        {emojiOpen && (
          <div className="absolute bottom-14 left-0 z-20 rounded-xl border bg-background p-2 shadow-lg">
            <div className="grid grid-cols-6 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={pending}
                  onClick={() => handleEmoji(emoji)}
                  className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
          <button
            type="button"
            aria-label="Add attachment"
            disabled
            title="File sharing is not available yet"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="size-5" />
          </button>

          <button
            type="button"
            aria-label="Add emoji"
            disabled={pending}
            onClick={() => setEmojiOpen((current) => !current)}
            className="hidden size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
          >
            <Smile className="size-5" />
          </button>

          <textarea
            ref={textareaRef}
            aria-label="Message"
            maxLength={10000}
            disabled={pending}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              editingMessage ? "Edit your message..." : "Write a message..."
            }
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />

          <button
            type="button"
            aria-label={pending ? "Saving message" : editingMessage ? "Save message" : "Send message"}
            disabled={pending || !value.trim()}
            onClick={handleSubmit}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>

        <p className="mt-1.5 hidden text-center text-[10px] text-muted-foreground sm:block">
          Press Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
