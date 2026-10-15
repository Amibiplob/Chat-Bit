"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CallKind, CallingState } from "@/lib/calling-types";
import { createCallingController } from "@/lib/calling-client.mjs";
import { messagingRequest } from "@/lib/messaging-client";
import { CallPanel } from "./call-panel";

type Controller=ReturnType<typeof createCallingController>;
type ContextValue={userId:string;state:CallingState;start:(id:string,kind:CallKind)=>void;act:(action:string)=>void;mute:()=>void;camera:()=>void;dismiss:()=>void};
const CallingContext=createContext<ContextValue|null>(null);
export function useCalling() {const value=useContext(CallingContext);if(!value) throw new Error("Calling provider required");return value;}
const initial:CallingState={call:null,local:null,remote:null,error:"",phase:"",muted:false,camera:false,working:false,seconds:0};
export function CallingProvider({userId,children}:{userId:string;children:React.ReactNode}) {
  const [state,setState]=useState(initial);
  const controller=useRef<Controller|null>(null);
  useEffect(()=> {
    const current=createCallingController({userId,tabId:crypto.randomUUID(),onChange:setState,
      request:messagingRequest,getMedia:async(constraints)=> {
        if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("Calling requires HTTPS and a browser with WebRTC support.");
        return navigator.mediaDevices.getUserMedia(constraints);
      },createPeer:(config)=>new RTCPeerConnection(config),makeStream:()=>new MediaStream(),visible:()=>document.visibilityState==="visible"});
    controller.current=current;current.begin();
    const wake=()=>current.wake();const leave=()=>current.stop();
    window.addEventListener("online",wake);window.addEventListener("focus",wake);
    document.addEventListener("visibilitychange",wake);window.addEventListener("pagehide",leave);
    const show=(event:PageTransitionEvent)=>{if(event.persisted) current.begin();};window.addEventListener("pageshow",show);
    return ()=>{current.stop();controller.current=null;window.removeEventListener("online",wake);window.removeEventListener("focus",wake);
      document.removeEventListener("visibilitychange",wake);window.removeEventListener("pagehide",leave);window.removeEventListener("pageshow",show);};
  },[userId]);
  const value:ContextValue={userId,state,start:(id,kind)=>{void controller.current?.start(id,kind);},act:(action)=>{void controller.current?.act(action);},
    mute:()=>controller.current?.mute(),camera:()=>controller.current?.camera(),dismiss:()=>controller.current?.dismiss()};
  return <CallingContext.Provider value={value}>{children}<CallPanel userId={userId}/></CallingContext.Provider>;
}
