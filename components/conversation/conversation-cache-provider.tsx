"use client";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createConversationCache } from '@/lib/conversation-cache.mjs';
import { recordCachedContent } from '@/lib/connection-performance.mjs';
import type { Conversation, MessagePage } from '@/lib/messaging-types';
import { ConversationLayout } from './conversation-layout';
import { RouteLoading } from '@/components/navigation/route-loading';

const Context=createContext<ReturnType<typeof createConversationCache>|null>(null);
export function ConversationCacheProvider({children}:{children:React.ReactNode}){
  const [cache]=useState(()=>createConversationCache());
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useConversationCache(){return useContext(Context);}
function useCacheState(){
  const cache=useConversationCache();
  if(!cache)throw new Error('Conversation cache provider required');
  useSyncExternalStore(cache.subscribe,cache.version,()=>0);
  return cache;
}
type Props={conversation:Conversation;initialPage:MessagePage;currentUserId:string};
// Direct URLs keep server authorization and SSR. After native in-app history
// transitions, this component only seeds fresh authorized RSC data into RAM.
export function ConversationRoute(props:Props){
  const cache=useCacheState();
  const pathname=usePathname();
  const seeded=useRef<MessagePage | null>(null);
  useLayoutEffect(()=>{if(seeded.current!==props.initialPage && pathname===`/chat/${props.conversation.id}`){seeded.current=props.initialPage;cache.put(props);}},[cache,props,pathname]);
  if(cache.enabled())return null;
  if(pathname!==`/chat/${props.conversation.id}`)return <RouteLoading label="conversation"/>;
  return <ConversationLayout {...props}/>;
}
export function ConversationViewport({children}:{children:React.ReactNode}){
  const cache=useCacheState();const pathname=usePathname();const router=useRouter();
  const id=/^\/chat\/([a-f0-9-]{36})$/i.exec(pathname)?.[1];
  const client=Boolean(id&&cache.enabled());const entry=id?cache.get(id):null;
  useEffect(()=>{if(client&&!entry)router.refresh();},[client,entry,router,pathname]);
  const cachedReady=Boolean(entry);
  useLayoutEffect(()=>{if(client&&cachedReady)recordCachedContent();},[client,cachedReady,id]);
  if(!client)return children;
  if(id&&cache.unavailable(id))return <p role="alert" className="p-5">Conversation unavailable. Return to Chats to choose another conversation.</p>;
  return <><div hidden>{children}</div>{entry?<ConversationLayout key={id} {...entry}/>:<RouteLoading label="conversation"/>}</>;
}
