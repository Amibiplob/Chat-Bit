"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Conversation, MessageCursor, MessagePage } from "@/lib/messaging-types";
import type { ConnectionStatus, Presence } from "@/lib/realtime-types";
import { messagingRequest } from "@/lib/messaging-client";
import { notify } from "@/lib/notifications.mjs";
import { useSettings } from "@/components/settings/settings-provider";
import { createSyncLoop } from "@/lib/realtime-client.mjs";

type Thread = { id: string; oldest: () => MessageCursor | null; receive: (page: MessagePage) => void };
type RealtimeState = {
  conversations: Conversation[]; status: ConnectionStatus; presence: Presence | null;
  register: (thread: Thread) => () => void; refresh: () => Promise<void>; typing: (active: boolean) => void;
};
const RealtimeContext = createContext<RealtimeState | null>(null);

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("Realtime provider is required");
  return value;
}

export function RealtimeProvider({ initialConversations, children }: { initialConversations: Conversation[]; children: React.ReactNode }) {
  const {profile}=useSettings();
  const settings=useRef(profile);
  useEffect(()=>{settings.current=profile;},[profile]);
  const notified=useRef(new Map(initialConversations.map(c=>[c.id,c.unread])));
  const pathname = usePathname();
  const router = useRouter();
  const candidate = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const conversationId = candidate && /^[a-f0-9-]{36}$/i.test(candidate) ? candidate.toLowerCase() : null;
  const selection = useRef(conversationId);
  const [conversations, setConversations] = useState(initialConversations);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [presence, setPresence] = useState<{ conversationId: string | null; value: Presence | null }>({ conversationId: null, value: null });
  const thread = useRef<Thread | null>(null);
  const loop = useRef<ReturnType<typeof createSyncLoop> | null>(null);
  const activity = useRef<(active: boolean) => void>(() => {});

  const refresh = useCallback(() => loop.current?.refresh() ?? Promise.resolve(), []);
  const register = useCallback((value: Thread) => {
    thread.current = value;
    loop.current?.select();
    return () => { if (thread.current === value) thread.current = null; };
  }, []);
  const typing = useCallback((active: boolean) => activity.current(active), []);

  useLayoutEffect(() => {
    if (selection.current === conversationId) return;
    selection.current = conversationId;
    loop.current?.select();
    activity.current(false);
  }, [conversationId]);

  useEffect(() => {
    const sync = createSyncLoop({
      request: (input, signal) => messagingRequest(`/api/realtime/sync?state=${encodeURIComponent(JSON.stringify(input))}`, { signal }),
      loadPage: (id, cursor, signal) => messagingRequest(`/api/conversations/${id}/messages?limit=100&cursor=${encodeURIComponent(JSON.stringify(cursor))}`, { signal }),
      getState: () => ({ conversationId: selection.current, oldest: thread.current?.id === selection.current ? thread.current.oldest() : null }),
      isVisible: () => navigator.onLine && (document.visibilityState === "visible" || (settings.current.notifyMessages && typeof Notification!=="undefined" && Notification.permission==="granted")),
      onSnapshot: (snapshot, input) => {
        if (input.conversationId !== selection.current) return;
        if (snapshot.conversations) {
          for(const row of snapshot.conversations) {
            if(row.unread>(notified.current.get(row.id)??0)) notify('message',row.id,settings.current.notifyMessages);
            notified.current.set(row.id,row.unread);
          }
          setConversations(snapshot.conversations);
        }
        setPresence({ conversationId: input.conversationId, value: snapshot.presence });
        if (snapshot.page && thread.current?.id === input.conversationId) thread.current.receive(snapshot.page);
      },
      onStatus: setStatus,
      onUnauthorized: () => router.replace("/login"),
    });
    loop.current = sync; sync.start();
    const wake = () => { if (document.visibilityState === "visible") void sync.refresh().catch(() => {}); };
    const offline = () => setStatus("offline");
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("offline", offline);
    return () => {
      sync.stop(); if (loop.current === sync) loop.current = null;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("offline", offline);
    };
  }, [router]);

  // One lease per mounted tab. Sequence numbers fence delayed navigation/leave
  // requests so an older heartbeat cannot resurrect stale typing or presence.
  const tab = useRef({ id: "", sequence: 0 });
  useEffect(() => {
    if (!tab.current.id) tab.current.id = crypto.randomUUID();
    let typingUntil = 0; let lastTypingSend = 0;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const send = (leaving = false) => {
      const body = { tabId: tab.current.id, sequence: ++tab.current.sequence, conversationId: selection.current,
        typing: !leaving && Date.now() < typingUntil, leaving };
      void messagingRequest("/api/realtime/activity", { method: "POST", body: JSON.stringify(body), keepalive: leaving }).catch(() => {});
    };
    const heartbeat = () => { if (document.visibilityState === "visible") send(); };
    const changed = () => { typingUntil = 0; if (document.visibilityState === "visible") send(); else send(true); };
    activity.current = (active) => {
      clearTimeout(stopTimer);
      typingUntil = active && selection.current ? Date.now() + 5000 : 0;
      if (document.visibilityState !== "visible") return;
      if (!active || Date.now() - lastTypingSend >= 3000) { lastTypingSend = Date.now(); send(); }
      if (active) stopTimer = setTimeout(() => { typingUntil = 0; send(); }, 5000);
    };
    const leave = () => { typingUntil = 0; send(true); };
    heartbeat();
    const timer = setInterval(heartbeat, 10000);
    document.addEventListener("visibilitychange", changed); window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer); clearTimeout(stopTimer); leave(); activity.current = () => {};
      document.removeEventListener("visibilitychange", changed); window.removeEventListener("pagehide", leave);
    };
  }, []);

  return <RealtimeContext.Provider value={{ conversations, status, presence: status === "connected" && presence.conversationId === conversationId ? presence.value : null, register, refresh, typing }}>{children}</RealtimeContext.Provider>;
}
