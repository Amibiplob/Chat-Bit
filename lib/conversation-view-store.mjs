/** Private, account-scoped RAM only. No message pages, files or browser storage.
 * @typedef {{top:number,pinned:boolean}} ScrollPosition
 * @typedef {{draft:string,scroll:ScrollPosition|null,retry:{fingerprint:string,id:string}|null}} View
 */
export function createConversationViewStore(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Invalid view limit');
  /** @type {Map<string,View>} */ const views = new Map();
  const sending = new Set();
  const listeners = new Set();
  const empty = () => ({draft:'',scroll:null,retry:null});
  function read(id) {
    const value = views.get(id);
    if (value) {views.delete(id);views.set(id,value);}
    return value ?? empty();
  }
  function write(id, patch) {
    const value = {...read(id), ...patch};
    if (!views.has(id) && views.size >= limit) {
      const oldest = [...views.keys()].find(key => !sending.has(key));
      if (!oldest) return; // Never evict an outstanding mutation's idempotency key.
      views.delete(oldest);
    }
    views.set(id,value);
  }
  return {
    read,
    setDraft(id, value) {
      if (typeof value !== 'string' || read(id).draft === value.slice(0,10000)) return;
      write(id,{draft:value.slice(0,10000)});listeners.forEach(fn=>fn());
    },
    setScroll(id, value) {if (Number.isFinite(value.top) && value.top >= 0 && typeof value.pinned === 'boolean') write(id,{scroll:{top:value.top,pinned:value.pinned}});},
    retry(id, fingerprint) {
      const previous=read(id).retry;
      if (previous?.fingerprint===fingerprint) return previous.id;
      const key=crypto.randomUUID();write(id,{retry:{fingerprint,id:key}});return key;
    },
    confirm(id, content) {
      const view=read(id);
      write(id,{retry:null,...(view.draft.trim()===content ? {draft:''} : {})});
    },
    beginSend(id) {
      if(sending.has(id) || sending.size>=limit) return false;
      // Reserve capacity before locking the entry.
      write(id,{});sending.add(id);listeners.forEach(fn=>fn());return true;
    },
    endSend(id) {sending.delete(id);listeners.forEach(fn=>fn());},
    isSending:id=>sending.has(id),
    subscribe(fn) {listeners.add(fn);return ()=>{listeners.delete(fn);};},
    size:()=>views.size,
  };
}
