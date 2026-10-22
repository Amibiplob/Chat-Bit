"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Conversation, MessageCursor, MessagePage } from "@/lib/messaging-types";
import type { ConnectionStatus, Presence } from "@/lib/realtime-types";
import { messagingRequest } from "@/lib/messaging-client";
import { notify } from "@/lib/notifications.mjs";
import { useSettings } from "@/components/settings/settings-provider";
import { useConversationCache } from "@/components/conversation/conversation-cache-provider";
import { createMessagingPollingPolicy } from "@/lib/messaging-polling-policy.mjs";
import { startPushClient } from "@/lib/push-client";
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

export function RealtimeProvider({ userId, sessionExpiresAt, initialConversations, children }: { userId:string; sessionExpiresAt?:number; initialConversations: Conversation[]; children: React.ReactNode }) {
  const {profile}=useSettings();
  const [denied,setDenied]=useState(false);
  const pushHealthy=useRef(false);
  const cache=useConversationCache();
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
  const lastArrival=useRef({conversationId:null as string|null,id:""});
  const [polling] = useState(()=>createMessagingPollingPolicy());
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
    polling.activate(); loop.current?.select();
    activity.current(false);
  }, [conversationId, polling]);

  useEffect(()=>{
    const rejected=(event:Event)=>{
      const expected=(event as CustomEvent<{accountId:string|null}>).detail?.accountId;
      if(expected&&expected!==userId)return;
      cache?.clear();loop.current?.stop();setDenied(true);router.replace("/login");
    };
    window.addEventListener("chatbit:session-rejected",rejected);
    return()=>window.removeEventListener("chatbit:session-rejected",rejected);
  },[cache,router,userId]);

  useEffect(()=>{
    if(!sessionExpiresAt||denied)return;
    const check=()=>{if(Date.now()>=sessionExpiresAt)window.dispatchEvent(new CustomEvent("chatbit:session-rejected",{detail:{accountId:userId}}));};
    const timer=setTimeout(check,Math.max(0,sessionExpiresAt-Date.now()));
    window.addEventListener("focus",check);window.addEventListener("pageshow",check);document.addEventListener("visibilitychange",check);
    return()=>{clearTimeout(timer);window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);document.removeEventListener("visibilitychange",check);};
  },[sessionExpiresAt,userId,denied]);

  useEffect(()=>{
    if(!presence.value?.typing)return;
    const timer=setTimeout(()=>setPresence(current=>current===presence?{...current,value:current.value?{...current.value,typing:false}:null}:current),6000);
    return()=>clearTimeout(timer);
  },[presence]);

  useEffect(()=>{
    if(denied)return;
    let stop:(()=>void)|undefined;
    const reconcile=()=>{
      const visible=navigator.onLine&&(document.visibilityState==="visible"||(settings.current.notifyMessages&&typeof Notification!=="undefined"&&Notification.permission==="granted"));
      if(!visible){stop?.();stop=undefined;pushHealthy.current=false;return;}
      if(!stop)stop=startPushClient(userId,refresh,pushHealthy);
    };
    reconcile();document.addEventListener("visibilitychange",reconcile);window.addEventListener("online",reconcile);window.addEventListener("offline",reconcile);window.addEventListener("focus",reconcile);
    return()=>{stop?.();document.removeEventListener("visibilitychange",reconcile);window.removeEventListener("online",reconcile);window.removeEventListener("offline",reconcile);window.removeEventListener("focus",reconcile);};
  },[userId,refresh,denied,profile.notifyMessages]);

  useEffect(() => {
    if(denied)return;
    const sync = createSyncLoop({
      request: (input, signal) => messagingRequest(`/api/realtime/sync?state=${encodeURIComponent(JSON.stringify(input))}`, { signal, headers:{"X-ChatBit-Account":userId} }),
      loadPage: (id, cursor, signal) => messagingRequest(`/api/conversations/${id}/messages?limit=100&cursor=${encodeURIComponent(JSON.stringify(cursor))}`, { signal }),
      getState: () => ({ accountId:userId, conversationId: selection.current, oldest: thread.current?.id === selection.current ? thread.current.oldest() : null }),
      isVisible: () => navigator.onLine && (document.visibilityState === "visible" || (settings.current.notifyMessages && typeof Notification!=="undefined" && Notification.permission==="granted")),
      getInterval: () => pushHealthy.current && document.visibilityState === "visible" ? 30000 : polling.interval(selection.current, document.visibilityState === "visible"),
      onSnapshot: (snapshot, input) => {
        if (input.conversationId !== selection.current) return;
        if(input.conversationId)cache?.touch(input.conversationId);
        if (snapshot.conversations) {
          for(const row of snapshot.conversations) {
            if(row.unread>(notified.current.get(row.id)??0)) notify('message',row.id,settings.current.notifyMessages);
            notified.current.set(row.id,row.unread);
          }
          setConversations(snapshot.conversations);
        }
        setPresence({ conversationId: input.conversationId, value: snapshot.presence });
        if (snapshot.page) {
          if(input.conversationId){
            const conversation=snapshot.conversations?.find(row=>row.id===input.conversationId);
            if(conversation)cache?.put({conversation,initialPage:snapshot.page,currentUserId:userId},true);
            else cache?.refreshPage(input.conversationId,snapshot.page);
          }
          const id=snapshot.page.messages.at(-1)?.id??"";
          if(id && (lastArrival.current.conversationId!==input.conversationId || lastArrival.current.id!==id))polling.activate();
          lastArrival.current={conversationId:input.conversationId,id};
          if(thread.current?.id===input.conversationId)thread.current.receive(snapshot.page);
        }
      },
      onStatus: setStatus,
      onUnauthorized: () => { window.dispatchEvent(new CustomEvent("chatbit:session-rejected",{detail:{accountId:userId}})); },
      onUnavailable: () => { if(selection.current)cache?.remove(selection.current); router.refresh(); },
    });
    loop.current = sync; sync.start();
    const wake = () => { if (document.visibilityState === "visible") { polling.activate(); void sync.refresh().catch(() => {}); } };
    const interact = () => polling.activate();
    const offline = () => setStatus("offline");
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("offline", offline);
    window.addEventListener("chatbit:message-saved", wake);
    document.addEventListener("pointerdown", interact, {passive:true});
    document.addEventListener("keydown", interact);
    return () => {
      sync.stop(); if (loop.current === sync) loop.current = null;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("offline", offline);
      window.removeEventListener("chatbit:message-saved", wake);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
    };
  }, [router, cache, polling, userId, denied]);

  // One lease per mounted tab. Sequence numbers fence delayed navigation/leave
  // requests so an older heartbeat cannot resurrect stale typing or presence.
  const tab = useRef({ id: "", sequence: 0 });
  useEffect(() => {
    if(denied)return;
    if (!tab.current.id) tab.current.id = crypto.randomUUID();
    let typingUntil = 0; let lastTypingSend = 0;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const send = (leaving = false, notify = false) => {
      const body = { tabId: tab.current.id, sequence: ++tab.current.sequence, conversationId: selection.current,
        typing: !leaving && Date.now() < typingUntil, leaving, notify };
      void messagingRequest("/api/realtime/activity", { method: "POST", body: JSON.stringify(body), headers:{"X-ChatBit-Account":userId}, keepalive: leaving }).catch(() => {});
    };
    const heartbeat = () => { if (document.visibilityState === "visible") send(); };
    const changed = () => { typingUntil = 0; if (document.visibilityState === "visible") send(false,true); else send(true,true); };
    activity.current = (active) => {
      clearTimeout(stopTimer);
      typingUntil = active && selection.current ? Date.now() + 5000 : 0;
      if (document.visibilityState !== "visible") return;
      if (!active || Date.now() - lastTypingSend >= 3000) { lastTypingSend = Date.now(); send(false,true); }
      if (active) stopTimer = setTimeout(() => { typingUntil = 0; send(false,true); }, 5000);
    };
    const leave = () => { typingUntil = 0; send(true,true); };
    heartbeat();
    const timer = setInterval(heartbeat, 10000);
    document.addEventListener("visibilitychange", changed); window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer); clearTimeout(stopTimer); leave(); activity.current = () => {};
      document.removeEventListener("visibilitychange", changed); window.removeEventListener("pagehide", leave);
    };
  }, [denied,userId]);

  if(denied)return null;
  return <RealtimeContext.Provider value={{ conversations, status, presence: status === "connected" && presence.conversationId === conversationId ? presence.value : null, register, refresh, typing }}>{children}</RealtimeContext.Provider>;
}
