"use client";

import { useEffect, useRef, useState } from "react";
import { File, Image, Paperclip, Send, Smile, X } from "lucide-react";

import type { Message } from "./conversation-data";

interface MessageComposerProps {
  onSend: (content: string) => void;
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
  replyingTo,
  editingMessage,
  onCancel,
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingMessage) {
      setValue(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  function handleSubmit() {
    const content = value.trim();

    if (!content) {
      return;
    }

    onSend(content);
    setValue("");
    setEmojiOpen(false);
    setAttachmentOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleEmoji(emoji: string) {
    setValue((current) => `${current}${emoji}`);
    textareaRef.current?.focus();
  }

  function handleCancel() {
    setValue("");
    setEmojiOpen(false);
    setAttachmentOpen(false);
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
                  onClick={() => handleEmoji(emoji)}
                  className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachment menu */}
        {attachmentOpen && (
          <div className="absolute bottom-14 left-10 z-20 w-40 rounded-xl border bg-background p-1 shadow-lg">
            <button
              type="button"
              onClick={() => setAttachmentOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <Image className="size-4" />
              Image
            </button>

            <button
              type="button"
              onClick={() => setAttachmentOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <File className="size-4" />
              Document
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
          <button
            type="button"
            aria-label="Add attachment"
            onClick={() => setAttachmentOpen((current) => !current)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="size-5" />
          </button>

          <button
            type="button"
            aria-label="Add emoji"
            onClick={() => setEmojiOpen((current) => !current)}
            className="hidden size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
          >
            <Smile className="size-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              editingMessage ? "Edit your message..." : "Write a message..."
            }
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />

          <button
            type="button"
            aria-label="Send message"
            disabled={!value.trim()}
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
