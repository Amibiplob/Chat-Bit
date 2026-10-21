// Fixed labels only: never accept URLs, actor IDs, payloads or error objects.
const operations = new Set(['page', 'messaging', 'calling', 'server']);
const stages = new Set(['initial-load', 'navigation', 'authentication', 'database-config', 'rate-limit', 'database', 'pool', 'conversation-list', 'conversation-init', 'messages', 'settings', 'sync', 'first-snapshot', 'delivery', 'request', 'permission', 'create', 'accept', 'discovery', 'ice-config', 'offer', 'answer', 'ice-candidate', 'ice-connected', 'media-ready', 'connected']);
export function browserPerformanceEnabled() {
  try { return typeof window !== 'undefined' && window.localStorage.getItem('chatbit.performance') === '1'; }
  catch { return false; }
}
/** Create an ephemeral correlation ID unrelated to any application identity.
 * @param {string} operation
 * @param {{enabled?:boolean, clock?:()=>number, sink?:(event:{operation:string,stage:string,durationMs:number,correlationId:string})=>void}} options */
export function createPerformanceTrace(operation, options = {}) {
  const enabled = options.enabled ?? browserPerformanceEnabled();
  const clock = options.clock ?? (() => performance.now());
  const sink = options.sink ?? ((event) => console.info('chatbit.performance', event));
  const correlationId = enabled ? crypto.randomUUID() : '';
  const started = enabled ? clock() : 0;
  const emitted = new Set();
  function duration(stage, durationMs) {
    if (!enabled || !operations.has(operation) || !stages.has(stage) || !Number.isFinite(durationMs) || durationMs < 0) return;
    try { sink({ operation, stage, durationMs: Math.round(durationMs * 10) / 10, correlationId }); } catch { /* Monitoring must never break a connection. */ }
  }
  return {
    duration,
    mark(stage) { if (!emitted.has(stage)) { emitted.add(stage); duration(stage, enabled ? clock() - started : 0); } },
    async step(stage, action) {
      const start = enabled ? clock() : 0;
      try { return await action(); } finally { duration(stage, enabled ? clock() - start : 0); }
    },
  };
}
