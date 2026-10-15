"use client";
import { createContext,useCallback,useContext,useEffect,useRef,useState } from "react";
import { messagingRequest } from "@/lib/messaging-client";
import type { SettingsProfile } from "@/lib/settings-types";
const Context=createContext<{profile:SettingsProfile;update:(p:SettingsProfile)=>void}|null>(null);
export function useSettings() {const value=useContext(Context);if(!value) throw new Error('Settings provider required');return value;}
export function SettingsProvider({initial,children}:{initial:SettingsProfile;children:React.ReactNode}) {
  const [profile,setProfile]=useState(initial),version=useRef(0);
  const update=useCallback((p:SettingsProfile)=>{version.current++;setProfile(p);},[]);
  useEffect(()=> {
    let stopped=false,running=false;const abort=new AbortController();
    const refresh=async()=> {
      if(stopped || running || document.visibilityState!=='visible') return;
      running=true;const capture=version.current;
      try {const next=await messagingRequest<SettingsProfile>('/api/settings',{signal:abort.signal});if(!stopped && capture===version.current) setProfile(next);} catch { /* Settings forms report their own actionable errors; retain the last verified snapshot. */ }
      finally {running=false;}
    };
    const wake=()=>{void refresh();};
    const timer=setInterval(wake,30000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
    return ()=>{stopped=true;abort.abort();clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};
  },[]);
  return <Context.Provider value={{profile,update}}>{children}</Context.Provider>;
}
