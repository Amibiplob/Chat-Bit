import { AsyncLocalStorage } from 'node:async_hooks';
const timing = new AsyncLocalStorage();
export function recordDatabaseTiming(poolMs, transactionMs) {
  const current = timing.getStore();
  if (current) { current.poolMs += poolMs; current.databaseMs += transactionMs; }
}
export async function timedOperation(operation) {
  const metrics = { poolMs: 0, databaseMs: 0 };
  const started = performance.now();
  return timing.run(metrics, async () => {
    const value = await operation();
    return { value, serverTiming: `app;dur=${(performance.now()-started).toFixed(1)}, pool;dur=${metrics.poolMs.toFixed(1)}, db;dur=${metrics.databaseMs.toFixed(1)}` };
  });
}
