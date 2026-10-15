"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import { Phone, PhoneMissed, Video } from "lucide-react";
import { useCalling } from "./calling-provider";
import { useRealtime } from "@/components/chat/realtime-provider";
import { messagingRequest } from "@/lib/messaging-client";
import type { CallRecord } from "@/lib/calling-types";
import { isLiveCall } from "@/lib/calling-client.mjs";

export function CallsPage() {
  const calling=useCalling();const {conversations}=useRealtime();
  const [history,setHistory]=useState<CallRecord[]>([]),[error,setError]=useState(""),[search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  const callId=calling.state.call?.id, status=calling.state.call?.status;
  useEffect(()=> {
    const abort=new AbortController();
    messagingRequest<CallRecord[]>("/api/calls",{signal:abort.signal}).then(rows=>{setHistory(rows);setError("");}).catch((error)=>{if(!abort.signal.aborted) setError(error.message);}).finally(()=>{if(!abort.signal.aborted) setLoading(false);});
    return ()=>abort.abort();
  },[callId,status,retry]);
  const busy=calling.state.working || isLiveCall(calling.state.call);
  return <main className="flex min-w-0 flex-1 flex-col bg-background">
    <header className="border-b px-5 py-4"><div className="flex items-center justify-between"><div><h1 className="text-lg font-semibold">Calls</h1><p className="text-xs text-muted-foreground">Your recent voice and video calls</p></div><Link href="/chat" className="text-sm text-blue-500">Chats</Link></div>
      <input aria-label="Search calls" type="search" placeholder="Search calls…" value={search} onChange={(event)=>setSearch(event.target.value)} className="mt-4 h-10 w-full rounded-lg border bg-muted/30 px-3 text-sm"/></header>
    <div className="flex-1 overflow-y-auto"><section className="border-b p-5"><h2 className="mb-2 text-sm font-medium">Start a call</h2>
      {!conversations.length && <p className="text-sm text-muted-foreground">Create a conversation to call someone.</p>}
      {conversations.filter((c)=>c.name.toLowerCase().includes(search.toLowerCase())).map((conversation)=><div key={conversation.id} className="flex items-center gap-2 py-2"><Avatar userId={conversation.participantId} name={conversation.name} version={conversation.avatarVersion}/><span className="min-w-0 flex-1 truncate text-sm">{conversation.name}</span>
        <button disabled={busy} onClick={()=>calling.start(conversation.id,"voice")} aria-label={`Voice call ${conversation.name}`} className="rounded-full p-2 hover:bg-muted disabled:opacity-40"><Phone className="size-5"/></button>
        <button disabled={busy} onClick={()=>calling.start(conversation.id,"video")} aria-label={`Video call ${conversation.name}`} className="rounded-full p-2 hover:bg-muted disabled:opacity-40"><Video className="size-5"/></button></div>)}
    </section><section aria-label="Call history"><h2 className="border-b bg-muted/40 px-5 py-2 text-xs font-medium">Recent calls (latest 50)</h2>
      {loading && <p role="status" className="p-5 text-sm">Loading calls…</p>}{error && <div className="p-5"><p role="alert" className="text-sm text-destructive">{error}</p><button className="mt-2 min-h-11 rounded-lg border px-4 text-sm" onClick={()=>{setLoading(true);setRetry(value=>value+1);}}>Retry call history</button></div>}
      {!loading && !history.length && <p className="p-5 text-sm text-muted-foreground">No calls yet.</p>}
      {history.filter((c)=>c.name.toLowerCase().includes(search.toLowerCase())).map((call)=><div key={call.id} className="flex items-center gap-3 border-b px-5 py-4">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ${call.status==="missed"?"bg-red-100 text-red-600":"bg-blue-100 text-blue-600"}`}>{call.status==="missed"?<PhoneMissed className="size-5"/>:call.kind==="video"?<Video className="size-5"/>:<Phone className="size-5"/>}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{call.name}</p><p className="text-xs capitalize text-muted-foreground">{call.callerId===calling.userId?"Outgoing":"Incoming"} · {call.kind} · {call.status}{call.duration!==null?` · ${call.duration}s`:""}</p><time dateTime={call.createdAt} className="text-xs text-muted-foreground">{new Date(call.createdAt).toLocaleString()}</time></div>
        <button disabled={busy} aria-label={`Call ${call.name} again`} onClick={()=>calling.start(call.conversationId,call.kind)} className="rounded-full p-2 hover:bg-muted disabled:opacity-40"><Phone className="size-5"/></button>
      </div>)}
    </section></div>
  </main>;
}
