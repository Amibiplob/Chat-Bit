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
  const client = await pool.connect();
  const acquiredAt = performance.now();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
    recordDatabaseTiming(acquiredAt - queuedAt, performance.now() - acquiredAt);
  }
}
