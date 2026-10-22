/** Private component-owned RAM. No browser persistence or shared server cache.
 * @typedef {{conversation:import('./messaging-types').Conversation,initialPage:import('./messaging-types').MessagePage,currentUserId:string}} Entry
 */
export function createConversationCache({limit=8,ttl=60000,clock=()=>performance.now()}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>8||!Number.isFinite(ttl)||ttl<=0||ttl>60000)throw new Error('Invalid cache bounds');
  /** @type {Map<string,{value:Entry,at:number}>} */ const entries=new Map();
  const listeners=new Set();const unavailable=new Set();let version=0;let enabled=false;
  const emit=()=>{version++;listeners.forEach(fn=>fn());};
  function get(id) {
    const entry=entries.get(id);
    if(!entry||clock()-entry.at>ttl)return null;
    return entry.value;
  }
  return {
    get,
    put(value, authorized=false) {
      const id=value.conversation.id;
      if(unavailable.has(id)&&!authorized)return;
      if(authorized)unavailable.delete(id);
      if(value.initialPage.messages.some(message=>message.conversationId!==id))throw new Error('Conversation cache identity mismatch');
      const messages=value.initialPage.messages.slice(-100);
      const first=messages[0];
      const nextCursor=value.initialPage.messages.length>100&&first?{id:first.id,createdAt:first.createdAt}:value.initialPage.nextCursor;
      const at=authorized?clock():entries.get(id)?.at??clock();
      entries.delete(id);
      entries.set(id,{value:{...value,initialPage:{messages,nextCursor}},at});
      while(entries.size>limit)entries.delete(entries.keys().next().value);
      emit();
    },
    touch(id){const entry=entries.get(id);if(entry)entry.at=clock();},
    refreshPage(id,page){const entry=entries.get(id);if(entry)this.put({...entry.value,initialPage:page},true);},
    remove(id){entries.delete(id);unavailable.add(id);while(unavailable.size>limit)unavailable.delete(unavailable.values().next().value);emit();},
    unavailable:id=>unavailable.has(id),
    clear(){entries.clear();unavailable.clear();emit();},
    enable(){enabled=true;emit();},
    enabled:()=>enabled,
    version:()=>version,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    size:()=>entries.size,
  };
}
