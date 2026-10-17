"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Send, Smile, X } from "lucide-react";

import type { Message } from "@/lib/messaging-types";
import { attachmentFileError } from "@/lib/attachment-policy.mjs";
import { MAX_MESSAGE_LENGTH } from "@/lib/form-validation.mjs";

interface MessageComposerProps {
  onSend: (content: string) => Promise<boolean>;
  pending: boolean;
  replyingTo: Message | null;
  editingMessage: Message | null;
  onCancel: () => void;
  onTyping: (active: boolean) => void;
  onSendAttachment: (file: File, caption: string, onProgress: (value: number) => void, signal: AbortSignal) => Promise<boolean>;
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
  onTyping,
  onSendAttachment,
}: MessageComposerProps) {
  const [value, setValue] = useState(editingMessage?.content ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState("");
  const upload = useRef<AbortController | null>(null);

  useEffect(() => () => upload.current?.abort(), []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);

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
    if (content.length > MAX_MESSAGE_LENGTH) { setFileError("Messages must be 10,000 characters or fewer."); return; }
    if (file && replyingTo) { setFileError("Cancel the reply before sending an attachment."); return; }

    if ((!content && !file) || pending || upload.current) {
      return;
    }
    const saved = file ? await (async () => {
      const controller = new AbortController(); upload.current = controller; setProgress(0); setFileError("");
      try { return await onSendAttachment(file, content, setProgress, controller.signal); }
      catch (error) { if ((error as Error).name !== "AbortError") setFileError(error instanceof Error ? error.message : "Upload failed."); return false; }
      finally { upload.current = null; }
    })() : await onSend(content);
    if (saved) {
      onTyping(false);
      setValue("");
      setFile(null); setProgress(0); setFileError("");
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
    if (value.length + emoji.length > MAX_MESSAGE_LENGTH) { setFileError("Messages must be 10,000 characters or fewer."); return; }
    setValue((current) => `${current}${emoji}`);
    onTyping(true);
    textareaRef.current?.focus();
  }

  function handleCancel() {
    upload.current?.abort();
    setValue("");
    setFile(null); setProgress(0); setFileError("");
    setEmojiOpen(false);
    onCancel();
    onTyping(false);
  }

  return (
    <div className="border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">
      {/* Reply / Edit preview */}
      {(replyingTo || editingMessage) && (
        <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <div className="min-w-0 border-l-2 border-teal-600 pl-3">
            <p className="text-xs font-medium text-teal-600">
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
        {file && <div className="mb-2 flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <FileText className="size-5 shrink-0 text-teal-600" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB{pending ? ` · ${progress === 100 ? "Verifying…" : `${progress}%`}` : ""}</p>
            {pending && <div role="progressbar" aria-label="Attachment upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={progress === 100 ? "Upload complete; verifying file" : `${progress}% uploaded`} className="mt-1 h-1 overflow-hidden rounded bg-muted"><div className="h-full bg-teal-600" style={{ width: `${progress}%` }} /></div>}</div>
          <button type="button" aria-label={pending ? "Cancel upload" : "Remove attachment"} onClick={() => { upload.current?.abort(); setFile(null); setProgress(0); }} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>}
        {fileError && <p role="alert" className="mb-2 text-xs text-destructive">{fileError}</p>}
        {/* Emoji picker */}
        {emojiOpen && (
          <div id="chatbit-emojis" role="group" aria-label="Choose an emoji" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setEmojiOpen(false);emojiButton.current?.focus();}}} className="absolute bottom-14 left-0 z-20 rounded-xl border bg-background p-2 shadow-lg">
            <div className="grid grid-cols-6 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={pending}
                  onClick={() => handleEmoji(emoji)}
                  className="flex size-11 items-center justify-center rounded-lg text-lg hover:bg-muted"
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
            disabled={pending || Boolean(editingMessage) || Boolean(replyingTo)}
            title={editingMessage ? "Finish editing before attaching a file" : replyingTo ? "Cancel the reply before attaching a file" : "Add attachment"}
            onClick={() => document.getElementById("chatbit-file-input")?.click()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip className="size-5" />
          </button>
          <input id="chatbit-file-input" type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.wav,.mp4,.webm" onChange={(event) => {
            const selected = event.target.files?.[0] ?? null; event.target.value = ""; setFileError("");
            const error = selected ? attachmentFileError(selected) : "";
            setFileError(error); setFile(error ? null : selected);
          }} />

          <button
            type="button"
            aria-label="Add emoji"
            ref={emojiButton}
            aria-expanded={emojiOpen}
            aria-controls="chatbit-emojis"
            disabled={pending}
            onClick={() => setEmojiOpen((current) => !current)}
            className="hidden size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
          >
            <Smile className="size-5" />
          </button>

          <textarea
            ref={textareaRef}
            aria-label="Message"
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={pending}
            value={value}
            onChange={(event) => { setValue(event.target.value); onTyping(Boolean(event.target.value.trim())); }}
            onBlur={() => onTyping(false)}
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
            disabled={pending || (!value.trim() && !file)}
            onClick={handleSubmit}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>

        <p className="mt-1.5 hidden text-center text-[10px] text-muted-foreground sm:block">
          Press Enter to send · Shift + Enter for a new line
        </p>
        <p className="mt-1 text-center text-xs text-muted-foreground">Files up to 10 MB · Images, PDF, text, Office, audio and video. File contents are verified after upload.</p>
      </div>
    </div>
  );
}
