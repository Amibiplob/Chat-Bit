"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, Message, MessagePage } from "@/lib/messaging-types";
import { recordMessagingReady } from "@/lib/connection-performance.mjs";
import { messagingRequest } from "@/lib/messaging-client";
import { ConversationHeader } from "./conversation-header";
import { MessageArea } from "./message-area";
import { MessageComposer } from "./message-composer";
import { useConversationView } from "./conversation-view-provider";
import { useRealtime } from "@/components/chat/realtime-provider";
import { uploadAttachment } from "@/lib/attachment-client";

export function ConversationLayout({ conversation, initialPage, currentUserId }: {
  conversation: Conversation; initialPage: MessagePage; currentUserId: string;
}) {
  useEffect(() => { recordMessagingReady(); }, []);
  const {store: viewStore, sending: sendingInBackground} = useConversationView(conversation.id);
  const saveScroll = useCallback((position: {top: number; pinned: boolean}) => viewStore.setScroll(conversation.id, position), [conversation.id, viewStore]);
  const { register, refresh: synchronize, presence, status, typing, conversations } = useRealtime();
  const [messages, setMessages] = useState(initialPage.messages);
  const [optimistic, setOptimistic] = useState<Message | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const savedKey = `chatbit-saved:${currentUserId}:${conversation.id}`;
  useEffect(() => {
    const load = () => { try { const value = JSON.parse(localStorage.getItem(savedKey) ?? "[]"); setSaved(Array.isArray(value) ? value.filter((id: unknown) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)).slice(0, 500) : []); } catch { setSaveError("Saved markers are unavailable in this browser."); } };
    load(); window.addEventListener("storage", load); return () => window.removeEventListener("storage", load);
  }, [savedKey]);
  function toggleSaved(id: string) { try { const next = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id].slice(-500); localStorage.setItem(savedKey, JSON.stringify(next)); setSaved(next); setSaveError(""); } catch { setSaveError("Could not save this marker. Browser storage may be unavailable."); } }
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [readAttempt, setReadAttempt] = useState(0);
  const busy = useRef(false);
  const acknowledged = useRef(new Set<string>());
  const base = `/api/conversations/${conversation.id}`;
  const readIds = messages.filter((message) => message.senderId !== currentUserId && !message.deleted).map((message) => message.id).join(",");
  const oldest = useRef(initialPage.messages[0] ? { id: initialPage.messages[0].id, createdAt: initialPage.messages[0].createdAt } : null);
  const receive = useCallback((page: MessagePage) => {
    oldest.current = page.messages[0] ? { id: page.messages[0].id, createdAt: page.messages[0].createdAt } : null;
    setMessages(page.messages); setNextCursor(page.nextCursor);
    setOptimistic(current => current && !page.messages.some(row => row.id === current.id) ? current : null);
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
    if (busy.current || !viewStore.beginSend(conversation.id)) return false;
    busy.current = true; setPending(true); setError("");
    let confirmed = false;
    try {
      if (editingMessage) {
        await messagingRequest(`${base}/messages/${editingMessage.id}`, { method: "PATCH", body: JSON.stringify({ content }) });
      } else {
        const replyToId = replyingTo?.id ?? null;
        const fingerprint = JSON.stringify({ content, replyToId });
        const clientId = viewStore.retry(conversation.id, fingerprint);
        setOptimistic({ id: clientId, conversationId: conversation.id, senderId: currentUserId, senderName: "You", content, createdAt: new Date().toISOString(), status: "sent", delivery: "sending", edited: false, deleted: false, attachments: [], reply: replyingTo ? { id: replyingTo.id, senderName: replyingTo.senderName, content: replyingTo.content, deleted: false } : null });
        const result = await messagingRequest<{id: string}>(`${base}/messages`, { method: "POST", body: JSON.stringify({ content, replyToId, clientId: clientId }) });
        setOptimistic(current => current ? { ...current, id: result.id, delivery: undefined } : null);
        viewStore.confirm(conversation.id, content);
      }
      confirmed = true; setReplyingTo(null); setEditingMessage(null);
      void reload().catch(() => setError("Message saved, but refresh failed. Use Refresh to load it."));
    } catch (error) { setOptimistic(null); setError(error instanceof Error ? `${error.message} Your draft is kept; send again to retry.` : "Message could not be saved. Your draft is kept; send again to retry."); }
    finally { viewStore.endSend(conversation.id); busy.current = false; setPending(false); }
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
    if (busy.current || !viewStore.beginSend(conversation.id)) return false;
    busy.current = true; setPending(true); setError("");
    let confirmed = false;
    try {
      await uploadAttachment(conversation.id, file, caption, onProgress, signal);
      confirmed = true; viewStore.confirm(conversation.id, caption); setReplyingTo(null);
      try { await reload(); } catch { setError("File saved, but refresh failed. Use Refresh to load it."); }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setError(error instanceof Error ? error.message : "The file could not be uploaded.");
      throw error;
    } finally { viewStore.endSend(conversation.id); busy.current = false; setPending(false); }
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

  const displayed = [...messages, ...(optimistic && !messages.some(row => row.id === optimistic.id) ? [optimistic] : [])].filter(row => row.content.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "saved" && saved.includes(row.id) || filter === "media" && row.attachments.some(file => /^(image|video)\//.test(file.mimeType)) || filter === "files" && row.attachments.some(file => !/^(image|video)\//.test(file.mimeType))));
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-muted/20" aria-label={`Conversation with ${conversation.name}`}>
      <ConversationHeader conversation={conversations.find((row) => row.id === conversation.id) ?? conversation}
        onRefresh={refresh} pending={pending} presence={presence} status={status} />
      {error && <p role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {readError && <p role="alert" className="border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">{readError}</p>}
      <details className="shrink-0 border-b bg-card px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted-foreground">Search & filter{(search || filter !== 'all') ? ` · ${displayed.length} matches` : ' · loaded history'}</summary>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <input aria-label="Search loaded messages" placeholder="Search loaded messages…" value={search} onChange={event=>setSearch(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl bg-muted/60 px-3 text-sm"/>
        <select aria-label="Filter loaded messages" value={filter} onChange={event=>setFilter(event.target.value)} className="h-11 max-w-full rounded-xl border bg-background px-2 text-sm"><option value="all">All messages</option><option value="media">Photos & videos</option><option value="files">Files</option><option value="saved">Saved on this device</option></select>
        {(search || filter !== "all") && <p role="status" className="w-full text-xs text-muted-foreground">{displayed.length} matching loaded messages. Load older messages for more. Saved markers stay in this browser.</p>}
      </div>
      </details>
      {saveError && <p role="alert" className="px-4 text-sm text-destructive">{saveError}</p>}
      <MessageArea initialScroll={viewStore.read(conversation.id).scroll} onSaveScroll={saveScroll} saved={saved} onToggleSaved={toggleSaved} messages={displayed} currentUserId={currentUserId} conversationInitials={conversation.initials} avatarVersion={conversation.avatarVersion}
        onReply={(message) => { setReplyingTo(message); setEditingMessage(null); }}
        onEdit={(message) => { setEditingMessage(message); setReplyingTo(null); }}
        onDelete={handleDelete} onDeleteAttachment={handleDeleteAttachment} onLoadOlder={loadOlder} hasMore={Boolean(nextCursor)} pending={pending} />
      <MessageComposer conversationId={conversation.id} key={editingMessage?.id ?? "new"} onSend={handleSend} pending={pending || sendingInBackground} replyingTo={replyingTo} onTyping={typing}
        onSendAttachment={handleAttachment} editingMessage={editingMessage} onCancel={() => { setReplyingTo(null); setEditingMessage(null); }} />
    </section>
  );
}
