import { performanceDuration } from './connection-performance.mjs';
import { diagnosticStep } from './messaging-diagnostics.mjs';
import { recordDatabaseTiming } from './request-timing.mjs';
/**
 * All transaction operations must use this client, never pool.query.
 * @template T
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function transaction(pool, operation) {
  const queuedAt = performance.now();
  const client = await diagnosticStep("database", () => pool.connect());
  const acquiredAt = performance.now();
  let discard = false;
  try {
    await diagnosticStep('database', () => client.query('BEGIN'));
    const result = await diagnosticStep("database", () => operation(client));
    await diagnosticStep('database', () => client.query('COMMIT'));
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
    recordDatabaseTiming(acquiredAt - queuedAt, performance.now() - acquiredAt);
    performanceDuration("pool", acquiredAt - queuedAt);
  }
}
