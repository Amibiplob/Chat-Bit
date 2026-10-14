"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Conversation, Message, MessagePage } from "@/lib/messaging-types";
import { messagingRequest } from "@/lib/messaging-client";
import { ConversationHeader } from "./conversation-header";
import { MessageArea } from "./message-area";
import { MessageComposer } from "./message-composer";

export function ConversationLayout({ conversation, initialPage, currentUserId }: {
  conversation: Conversation; initialPage: MessagePage; currentUserId: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialPage.messages);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [readAttempt, setReadAttempt] = useState(0);
  const busy = useRef(false);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const base = `/api/conversations/${conversation.id}`;
  const readIds = messages.filter((message) => message.senderId !== currentUserId && !message.deleted).map((message) => message.id).join(",");

  useEffect(() => {
    if (!readIds) return;
    const controller = new AbortController();
    async function read() {
      if (document.visibilityState !== "visible") return;
      try {
        const ids = readIds.split(",");
        for (let i = 0; i < ids.length; i += 100) {
          await messagingRequest(`${base}/read`, { method: "POST", body: JSON.stringify({ messageIds: ids.slice(i, i + 100) }), signal: controller.signal });
        }
        if (!controller.signal.aborted) router.refresh();
      } catch {
        if (!controller.signal.aborted) setError("Messages loaded, but read state could not be saved. Refresh to retry.");
      }
    }
    void read();
    document.addEventListener("visibilitychange", read);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", read); };
  }, [base, readIds, readAttempt, router]);

  async function reload() {
    const page = await messagingRequest<MessagePage>(`${base}/messages`);
    setMessages(page.messages); setNextCursor(page.nextCursor);
    setReadAttempt((attempt) => attempt + 1);
    router.refresh();
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

  async function loadOlder() {
    if (busy.current || !nextCursor) return;
    busy.current = true; setPending(true); setError("");
    try {
      const page = await messagingRequest<MessagePage>(`${base}/messages?cursor=${encodeURIComponent(JSON.stringify(nextCursor))}`);
      setMessages((current) => {
        const seen = new Set<string>();
        return [...page.messages, ...current].filter((message) => { if (seen.has(message.id)) return false; seen.add(message.id); return true; });
      });
      setNextCursor(page.nextCursor);
    } catch (error) { setError(error instanceof Error ? error.message : "Older messages could not be loaded."); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-muted/20" aria-label={`Conversation with ${conversation.name}`}>
      <ConversationHeader conversation={conversation} onRefresh={refresh} pending={pending} />
      {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      <MessageArea messages={messages} currentUserId={currentUserId} conversationInitials={conversation.initials}
        onReply={(message) => { setReplyingTo(message); setEditingMessage(null); }}
        onEdit={(message) => { setEditingMessage(message); setReplyingTo(null); }}
        onDelete={handleDelete} onLoadOlder={loadOlder} hasMore={Boolean(nextCursor)} pending={pending} />
      <MessageComposer key={editingMessage?.id ?? "new"} onSend={handleSend} pending={pending} replyingTo={replyingTo}
        editingMessage={editingMessage} onCancel={() => { setReplyingTo(null); setEditingMessage(null); }} />
    </section>
  );
}
