"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, Message, MessagePage } from "@/lib/messaging-types";
import { messagingRequest } from "@/lib/messaging-client";
import { ConversationHeader } from "./conversation-header";
import { MessageArea } from "./message-area";
import { MessageComposer } from "./message-composer";
import { useRealtime } from "@/components/chat/realtime-provider";
import { uploadAttachment } from "@/lib/attachment-client";

export function ConversationLayout({ conversation, initialPage, currentUserId }: {
  conversation: Conversation; initialPage: MessagePage; currentUserId: string;
}) {
  const { register, refresh: synchronize, presence, status, typing, conversations } = useRealtime();
  const [messages, setMessages] = useState(initialPage.messages);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [readAttempt, setReadAttempt] = useState(0);
  const busy = useRef(false);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const acknowledged = useRef(new Set<string>());
  const base = `/api/conversations/${conversation.id}`;
  const readIds = messages.filter((message) => message.senderId !== currentUserId && !message.deleted).map((message) => message.id).join(",");
  const oldest = useRef(initialPage.messages[0] ? { id: initialPage.messages[0].id, createdAt: initialPage.messages[0].createdAt } : null);
  const receive = useCallback((page: MessagePage) => {
    oldest.current = page.messages[0] ? { id: page.messages[0].id, createdAt: page.messages[0].createdAt } : null;
    setMessages(page.messages); setNextCursor(page.nextCursor);
  }, []);
  useEffect(() => register({ id: conversation.id, oldest: () => oldest.current, receive }), [conversation.id, register, receive]);

  useEffect(() => {
    if (!readIds) return;
    const controller = new AbortController();
    async function read() {
      if (document.visibilityState !== "visible" || status !== "connected") return;
      try {
        const ids = readIds.split(",").filter((id) => !acknowledged.current.has(id));
        if (!ids.length) return;
        for (let i = 0; i < ids.length; i += 100) {
          await messagingRequest(`${base}/read`, { method: "POST", body: JSON.stringify({ messageIds: ids.slice(i, i + 100) }), signal: controller.signal });
          if (!controller.signal.aborted) for (const id of ids.slice(i, i + 100)) acknowledged.current.add(id);
        }
        if (!controller.signal.aborted) { setReadError(""); await synchronize().catch(() => {}); }
      } catch {
        if (!controller.signal.aborted) setReadError("Read state could not be saved. Reconnecting or refreshing will retry.");
      }
    }
    void read();
    document.addEventListener("visibilitychange", read);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", read); };
  }, [base, readIds, readAttempt, synchronize, status]);

  async function reload() {
    await synchronize();
    setReadAttempt((attempt) => attempt + 1);
  }

  async function refresh() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : "Refresh failed."); }
    finally { busy.current = false; setPending(false); }
  }

  async function handleSend(content: string) {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError("");
    let confirmed = false;
    try {
      if (editingMessage) {
        await messagingRequest(`${base}/messages/${editingMessage.id}`, { method: "PATCH", body: JSON.stringify({ content }) });
      } else {
        const replyToId = replyingTo?.id ?? null;
        const fingerprint = JSON.stringify({ content, replyToId });
        if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
        await messagingRequest(`${base}/messages`, { method: "POST", body: JSON.stringify({ content, replyToId, clientId: retry.current.id }) });
        retry.current = null;
      }
      confirmed = true; setReplyingTo(null); setEditingMessage(null);
      try { await reload(); } catch { setError("Message saved, but refresh failed. Use Refresh to load it."); }
    } catch (error) { setError(error instanceof Error ? error.message : "Message could not be saved. Try again."); }
    finally { busy.current = false; setPending(false); }
    return confirmed;
  }

  async function handleDelete(messageId: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      await messagingRequest(`${base}/messages/${messageId}`, { method: "DELETE" });
      if (editingMessage?.id === messageId) setEditingMessage(null);
      if (replyingTo?.id === messageId) setReplyingTo(null);
      try { await reload(); } catch { setError("Message deleted, but refresh failed. Use Refresh to load the update."); }
    } catch (error) { setError(error instanceof Error ? error.message : "Message could not be deleted."); }
    finally { busy.current = false; setPending(false); }
  }

  async function handleAttachment(file: File, caption: string, onProgress: (value: number) => void, signal: AbortSignal) {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError("");
    let confirmed = false;
    try {
      await uploadAttachment(conversation.id, file, caption, onProgress, signal);
      confirmed = true; setReplyingTo(null);
      try { await reload(); } catch { setError("File saved, but refresh failed. Use Refresh to load it."); }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setError(error instanceof Error ? error.message : "The file could not be uploaded.");
      throw error;
    } finally { busy.current = false; setPending(false); }
    return confirmed;
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      await messagingRequest(`${base}/attachments/${attachmentId}`, { method: "DELETE" });
      await reload();
    } catch (error) { setError(error instanceof Error ? error.message : "The attachment could not be deleted."); }
    finally { busy.current = false; setPending(false); }
  }

  async function loadOlder() {
    if (busy.current || !nextCursor) return;
    busy.current = true; setPending(true); setError("");
    try {
      const page = await messagingRequest<MessagePage>(`${base}/messages?cursor=${encodeURIComponent(JSON.stringify(nextCursor))}`);
      if (page.messages[0]) oldest.current = { id: page.messages[0].id, createdAt: page.messages[0].createdAt };
      setMessages((current) => {
        const seen = new Set<string>();
        return [...page.messages, ...current].filter((message) => { if (seen.has(message.id)) return false; seen.add(message.id); return true; });
      });
      setNextCursor(page.nextCursor);
      // Fence any in-flight snapshot captured before history was prepended.
      await synchronize();
    } catch (error) { setError(error instanceof Error ? error.message : "Older messages could not be loaded."); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-muted/20" aria-label={`Conversation with ${conversation.name}`}>
      <ConversationHeader conversation={conversations.find((row) => row.id === conversation.id) ?? conversation}
        onRefresh={refresh} pending={pending} presence={presence} status={status} />
      {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {readError && <p role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">{readError}</p>}
      <MessageArea messages={messages} currentUserId={currentUserId} conversationInitials={conversation.initials}
        onReply={(message) => { setReplyingTo(message); setEditingMessage(null); }}
        onEdit={(message) => { setEditingMessage(message); setReplyingTo(null); }}
        onDelete={handleDelete} onDeleteAttachment={handleDeleteAttachment} onLoadOlder={loadOlder} hasMore={Boolean(nextCursor)} pending={pending} />
      <MessageComposer key={editingMessage?.id ?? "new"} onSend={handleSend} pending={pending} replyingTo={replyingTo} onTyping={typing}
        onSendAttachment={handleAttachment} editingMessage={editingMessage} onCancel={() => { setReplyingTo(null); setEditingMessage(null); }} />
    </section>
  );
}
