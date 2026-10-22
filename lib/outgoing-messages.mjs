import { createPerformanceTrace } from './connection-performance.mjs';
const empty=/** @type {import('./messaging-types').Message[]} */ ([]);
Object.freeze(empty);
/** Account-owned RAM outbox, serialized per conversation. No unload persistence.
 * @param {{request:(message:import('./messaging-types').Message,signal:AbortSignal)=>Promise<import('./messaging-types').Message>,
 * onFailure?:(message:import('./messaging-types').Message)=>void,onConfirmed?:()=>void,onUnauthorized?:()=>void,
 * retryDelay?:number}} options */
export function createOutgoingMessages(options){
  /** @type {Map<string,import('./messaging-types').Message[]>} */ const threads=new Map();
  const active=new Map();const listeners=new Set();const traces=new Map();
  let stopped=false;
  const emit=()=>listeners.forEach(fn=>fn());
  const read=id=>threads.get(id)??empty;
  function replace(id,clientId,update){if(!read(id).some(message=>message.clientId===clientId))return;threads.set(id,read(id).map(message=>message.clientId===clientId?update(message):message));emit();}
  async function run(id){
    if(stopped||active.has(id))return;
    const message=read(id).find(row=>row.delivery==='sending');if(!message)return;
    const controller=new AbortController();active.set(id,controller);
    try{
      let confirmed;
      for(let attempt=0;attempt<2;attempt++){
        traces.get(message.clientId)?.mark('request-init');
        try{confirmed=await options.request(message,controller.signal);break;}
        catch(error){
          const status=Number(error?.status);
          const recoverable=!status||status===408||status===429||status>=500;
          if(attempt||!recoverable||controller.signal.aborted)throw error;
          await new Promise(resolve=>{const timer=setTimeout(resolve,options.retryDelay??750);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve(undefined);},{once:true});});
          controller.signal.throwIfAborted();
        }
      }
      if(stopped)return;
      if(!confirmed||confirmed.conversationId!==id||confirmed.senderId!==message.senderId||confirmed.clientId!==message.clientId)throw new Error('Invalid message acknowledgement');
      traces.get(message.clientId)?.mark('response-confirmed');
      replace(id,message.clientId,()=>confirmed);
      options.onConfirmed?.();
    }catch(error){
      if(stopped)return;
      const stillPending=read(id).find(row=>row.clientId===message.clientId);
      if(stillPending){replace(id,message.clientId,row=>({...row,delivery:'failed'}));options.onFailure?.(message);}
      if(Number(error?.status)===401){
        stopped=true;for(const request of active.values())request.abort();
        threads.clear();traces.clear();emit();options.onUnauthorized?.();
      }
    }finally{
      active.delete(id);
      if(!stopped)void run(id);
    }
  }
  return {
    read,
    /** @param {import('./messaging-types').Message} message */
    enqueue(message){
      if(stopped||[...threads.values()].reduce((n,rows)=>n+rows.length,0)>=20)return false;
      if(!message.clientId||read(message.conversationId).some(row=>row.clientId===message.clientId))return false;
      traces.set(message.clientId,createPerformanceTrace('messaging'));
      threads.set(message.conversationId,[...read(message.conversationId),message]);emit();queueMicrotask(()=>void run(message.conversationId));return true;
    },
    retry(id,clientId){const row=read(id).find(message=>message.clientId===clientId);if(row?.delivery!=='failed')return false;replace(id,clientId,message=>({...message,delivery:'sending'}));queueMicrotask(()=>void run(id));return true;},
    reconcile(id,messages){
      const retained=read(id).filter(local=>!messages.some(server=>server.id===local.id||server.clientId&&server.clientId===local.clientId&&server.senderId===local.senderId));
      if(retained.length!==read(id).length){for(const row of read(id))if(!retained.includes(row))traces.delete(row.clientId);if(retained.length)threads.set(id,retained);else threads.delete(id);emit();}
    },
    rendered(id){for(const row of read(id))traces.get(row.clientId)?.mark(row.delivery==='sending'?'optimistic-display':row.delivery?'receiver-render':'confirmed-render');},
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    stop(){stopped=true;for(const controller of active.values())controller.abort();threads.clear();traces.clear();emit();},
  };
}

/** Keep canonical server order, append unsaved messages in local acceptance
 * order, and reconcile only matching sender/submission identities.
 * @param {import('./messaging-types').Message[]} messages
 * @param {readonly import('./messaging-types').Message[]} outgoing */
export function mergeOutgoingMessages(messages,outgoing){
  const unseen=outgoing.filter(local=>!messages.some(server=>server.id===local.id||server.clientId&&server.clientId===local.clientId&&server.senderId===local.senderId));
  return [...[...messages,...unseen.filter(row=>!row.delivery)].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)),...unseen.filter(row=>row.delivery)];
}
