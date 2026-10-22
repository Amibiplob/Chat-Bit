"use client";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { messagingRequest } from '@/lib/messaging-client';
import type { Message } from '@/lib/messaging-types';
import { createOutgoingMessages } from '@/lib/outgoing-messages.mjs';
import { useConversationCache } from './conversation-cache-provider';
import { createConversationViewStore } from '@/lib/conversation-view-store.mjs';
const OutgoingContext=createContext<ReturnType<typeof createOutgoingMessages>|null>(null);
const Context=createContext<ReturnType<typeof createConversationViewStore>|null>(null);
export function ConversationViewProvider({children,userId}:{children:React.ReactNode;userId:string}) {
  const [store]=useState(()=>createConversationViewStore());
  const router=useRouter();const cache=useConversationCache();
  const [outgoing]=useState(()=>createOutgoingMessages({
    request:async(message,signal)=>(await messagingRequest<{message:Message}>(`/api/conversations/${message.conversationId}/messages`,{method:'POST',headers:{'X-ChatBit-Account':message.senderId},body:JSON.stringify({content:message.content,clientId:message.clientId,replyToId:message.reply?.id??null}),signal})).message,
    onFailure:message=>{if(!store.read(message.conversationId).draft)store.setDraft(message.conversationId,message.content);},
    onConfirmed:()=>window.dispatchEvent(new Event('chatbit:message-saved')),
    onUnauthorized:()=>{cache?.clear();router.replace('/login');},
  }));
  useEffect(()=>{
    const rejected=(event:Event)=>{
      const expected=(event as CustomEvent<{accountId:string|null}>).detail?.accountId;
      if(expected&&expected!==userId)return;
      outgoing.stop();store.clear();cache?.clear();
    };
    window.addEventListener('chatbit:session-rejected',rejected);
    return()=>window.removeEventListener('chatbit:session-rejected',rejected);
  },[outgoing,store,cache,userId]);
  const cleanup=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>{clearTimeout(cleanup.current);return()=>{cleanup.current=setTimeout(()=>outgoing.stop(),0);};},[outgoing]);
  return <Context.Provider value={store}><OutgoingContext.Provider value={outgoing}>{children}</OutgoingContext.Provider></Context.Provider>;
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

export function useOutgoingMessages(id:string){
  const store=useContext(OutgoingContext);if(!store)throw new Error('Outgoing provider required');
  const messages=useSyncExternalStore(store.subscribe,()=>store.read(id),()=>store.read(''));
  return {outgoing:store,messages};
}
