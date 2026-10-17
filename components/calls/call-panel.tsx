"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { isLiveCall } from "@/lib/calling-client.mjs";
import { Avatar } from "@/components/profile/avatar";
import { useCalling } from "./calling-provider";

function Media({stream,local,video}:{stream:MediaStream|null;local?:boolean;video:boolean}) {
  const ref=useRef<HTMLVideoElement>(null);
  const [blocked,setBlocked]=useState(false);
  useEffect(()=> {
    const element=ref.current;if(!element) return;
    element.srcObject=stream;
    let active=true;
    if(stream) void element.play().then(()=>{if(active) setBlocked(false);}).catch(()=>{if(active) setBlocked(true);});
    return ()=>{active=false;element.srcObject=null;};
  },[stream]);
  return <div className={video?"relative min-h-24 overflow-hidden rounded-xl bg-black":""}>
    <video ref={ref} autoPlay playsInline muted={local} aria-label={local?"Local camera preview":"Remote media"}
      className={video?`max-h-[45svh] w-full object-contain ${local?"-scale-x-100":""}`:"h-0 w-0"}/>
    {!local && blocked && <button className="rounded-lg border p-2 text-sm" onClick={()=>{void ref.current?.play().then(()=>setBlocked(false)).catch(()=>{});}}>Play remote audio</button>}
  </div>;
}
export function CallPanel({userId}:{userId:string}) {
  const {state,act,mute,camera,dismiss}=useCalling();
  const {call}=state;const dialog=useRef<HTMLDialogElement>(null);
  const incoming=call?.status==="ringing" && call.calleeId===userId;
  const modal=Boolean(call && (incoming || call.owned || !isLiveCall(call)));
  useEffect(()=> {
    if(!modal) return;
    const previous=document.activeElement as HTMLElement|null;
    const root=dialog.current;
    if(root && !root.open) root.showModal();
    root?.focus();
    const key=(event:KeyboardEvent)=> {
      if(event.key!=="Tab" || !root) return;
      const elements=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],video[controls]'));
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey && (document.activeElement===first || document.activeElement===root)) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",key);return ()=>{document.removeEventListener("keydown",key);root?.close();previous?.focus();};
  },[call?.id,modal]);
  if(!call) return state.error ? <div role="alert" className="fixed bottom-5 left-1/2 z-50 flex w-[90%] max-w-lg -translate-x-1/2 items-center gap-3 rounded-xl border bg-background p-4 shadow-xl">{state.error}<button onClick={dismiss} aria-label="Dismiss call error"><X className="size-4"/></button></div> : state.working ? <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border bg-background p-4">{state.phase}</div> : null;
  if(!modal) return <div role="status" className="fixed bottom-4 right-4 z-40 rounded-xl border bg-background p-3 shadow-lg">Call with {call.name} is open in another tab.</div>;
  const live=isLiveCall(call);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
    <dialog ref={dialog} onCancel={event=>{event.preventDefault();if(!isLiveCall(call)) dismiss();}} tabIndex={-1} role="dialog" aria-modal="true" aria-label={incoming?"Incoming call":"Call"} className="m-auto max-h-[95svh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl outline-none">
      <Avatar userId={call.callerId===userId?call.calleeId:call.callerId} name={call.name} version={call.avatarVersion}/>
      <h2 className="text-lg font-semibold">{incoming?"Incoming ":""}{call.kind==="voice"?"Voice":"Video"} call · {call.name}</h2>
      <p role="status" className="mt-1 text-sm capitalize text-muted-foreground">{live?(state.phase||call.status):call.status}{call.status==="active"?` · ${Math.floor(state.seconds/60)}:${String(state.seconds%60).padStart(2,"0")}`:""}</p>
      {state.error && <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p>}
      {live && call.owned && <div className="mt-4 grid gap-3">
        <Media stream={state.remote} video={call.kind==="video"}/>
        {call.kind==="video" && <div className="ml-auto w-1/3"><Media stream={state.local} local video/></div>}
      </div>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {incoming && <><button disabled={state.working} onClick={()=>act("accept")} className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-white"><Phone className="size-5"/>Accept call</button>
          <button disabled={state.working} onClick={()=>act("reject")} className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-white"><PhoneOff className="size-5"/>Decline call</button></>}
        {live && call.owned && !incoming && <>
          <button aria-label={state.muted?"Unmute microphone":"Mute microphone"} aria-pressed={state.muted} onClick={mute} className="rounded-full border p-3">{state.muted?<MicOff/>:<Mic/>}</button>
          {call.kind==="video" && <button aria-label={state.camera?"Disable camera":"Enable camera"} aria-pressed={!state.camera} onClick={camera} className="rounded-full border p-3">{state.camera?<Video/>:<VideoOff/>}</button>}
          <button disabled={state.working} onClick={()=>act(call.status==="ringing"?"cancel":"end")} className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-white"><PhoneOff/>End call</button>
        </>}
        {!live && <button disabled={state.working} onClick={dismiss} className="rounded-full border px-5 py-3 disabled:opacity-50">Close call</button>}
      </div>
    </dialog>
  </div>;
}
