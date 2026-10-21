"use client";
import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { createConversationViewStore } from '@/lib/conversation-view-store.mjs';
const Context=createContext<ReturnType<typeof createConversationViewStore>|null>(null);
export function ConversationViewProvider({children}:{children:React.ReactNode}) {
  const [store]=useState(()=>createConversationViewStore());
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useConversationView(id:string) {
  const store=useContext(Context);
  if(!store)throw new Error('Conversation view provider required');
  const sending=useSyncExternalStore(store.subscribe,()=>store.isSending(id),()=>false);
  return {store,sending};
}

export function useConversationDraft(id:string) {
  const store=useContext(Context);
  if(!store)throw new Error('Conversation view provider required');
  const draft=useSyncExternalStore(store.subscribe,()=>store.read(id).draft,()=>'');
  return {store,draft};
}
