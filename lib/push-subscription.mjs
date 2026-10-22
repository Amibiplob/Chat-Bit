import {createPushRefresh} from './push-refresh.mjs';
/** Account-owned transport lifecycle. Dependency injection is for isolated
 * protocol fixtures; production never accepts endpoint overrides or browser keys.
 * @param {{token:(signal:AbortSignal)=>Promise<any>,loadClient:()=>Promise<(options:any)=>any>,refresh:()=>Promise<void>,healthy:{current:boolean},onEvent?:()=>void}} options */
export function createPushSubscription({token,loadClient,refresh,healthy,onEvent=()=>{}}){
  const abort = new AbortController();
  const updates = createPushRefresh(refresh, () => { healthy.current = false; });
  let client;
  let retry;
  function retryLater(){
    if(!abort.signal.aborted&&retry===undefined)retry=setTimeout(()=>{retry=undefined;void start();},30000);
  }
  async function start() {
    try {
      const initial = await token(abort.signal);
      if (abort.signal.aborted || !initial.enabled) return;
      const createClient = await loadClient();
      if (abort.signal.aborted) return;
      let first = true;
      const current = createClient({ autoConnect: false, logLevel: 0,
        authCallback: (_params, callback) => {
          if (first) { first = false; callback(null, initial.tokenRequest); return; }
          void token(abort.signal).then(value => {
            if (!abort.signal.aborted && value.enabled && value.channel === initial.channel) callback(null, value.tokenRequest);
            else { healthy.current = false; callback("Realtime authorization unavailable", null); current.close(); if(value.enabled)retryLater(); }
          }, () => { healthy.current = false; callback("Realtime authorization unavailable", null); });
        },
      });
      client=current;
      current.connection.on(change => {
        if(abort.signal.aborted||client!==current)return;
        if (change.current !== "connected") { healthy.current = false; updates.wake(); }
        if(change.current==="failed"){current.close();retryLater();}
      });
      const channel = current.channels.get(initial.channel);
      channel.on(change => {
        if(abort.signal.aborted||client!==current)return;
        healthy.current = change.current === "attached" && current.connection.state === "connected";
        if(change.current==="failed"){current.close();retryLater();}
        if (healthy.current) updates.wake(); // Initial attach and every reattach resync missed changes.
      });
      current.connect();
      await channel.subscribe("invalidate", () => {
        if (abort.signal.aborted||client!==current) return;
        onEvent();
        updates.wake(); // Canonical IDs/order/receipts come from authorized Neon snapshots.
      });
    } catch {
      client?.close();
      healthy.current = false;
      retryLater();
    }
  }
  void start();
  return () => { abort.abort(); clearTimeout(retry); updates.stop(); healthy.current = false; client?.close(); };
}
