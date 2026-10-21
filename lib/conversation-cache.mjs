/** Private component-owned RAM. No browser persistence or shared server cache.
 * @typedef {{conversation:import('./messaging-types').Conversation,initialPage:import('./messaging-types').MessagePage,currentUserId:string}} Entry
 */
export function createConversationCache({limit=8,ttl=60000,clock=()=>Date.now()}={}) {
  /** @type {Map<string,{value:Entry,at:number}>} */ const entries=new Map();
  const listeners=new Set();let version=0;let enabled=false;
  const emit=()=>{version++;listeners.forEach(fn=>fn());};
  function get(id) {
    const entry=entries.get(id);
    if(!entry||clock()-entry.at>ttl)return null;
    return entry.value;
  }
  return {
    get,
    put(value) {
      const id=value.conversation.id;
      if(value.initialPage.messages.some(message=>message.conversationId!==id))throw new Error('Conversation cache identity mismatch');
      const messages=value.initialPage.messages.slice(-100);
      const first=messages[0];
      const nextCursor=value.initialPage.messages.length>100&&first?{id:first.id,createdAt:first.createdAt}:value.initialPage.nextCursor;
      entries.delete(id);
      entries.set(id,{value:{...value,initialPage:{messages,nextCursor}},at:clock()});
      while(entries.size>limit)entries.delete(entries.keys().next().value);
      emit();
    },
    touch(id){const entry=entries.get(id);if(entry)entry.at=clock();},
    remove(id){entries.delete(id);emit();},
    clear(){entries.clear();emit();},
    enable(){enabled=true;emit();},
    enabled:()=>enabled,
    version:()=>version,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    size:()=>entries.size,
  };
}
