import { timingSafeEqual } from 'node:crypto';
import { transaction } from './transaction.mjs';

export function cleanupAuthorized(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// No cookie-based authorization: a scheduler must present its own credential.
export async function cleanupResponse(request, secret, operation) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!cleanupAuthorized(request, secret)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    await operation();
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: 'Cleanup unavailable' }, { status: 503, headers });
  }
}

export async function cleanupSessions(pool) {
  return transaction(pool, async client => {
    // Retain departure fences for at least a minute. Never remove a live lease.
    await client.query(`DELETE FROM realtime_activity WHERE (session_hash,tab_id) IN
      (SELECT session_hash,tab_id FROM realtime_activity WHERE expires_at < now()-interval '1 minute'
       ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED)`);
    // Cascades to remaining leases; calls reconcile revoked owners separately.
    await client.query(`DELETE FROM sessions WHERE token_hash IN
      (SELECT token_hash FROM sessions WHERE expires_at<=now() ORDER BY expires_at
       LIMIT 500 FOR UPDATE SKIP LOCKED)`);
    await client.query(`DELETE FROM auth_rate_limits WHERE key_hash IN
      (SELECT key_hash FROM auth_rate_limits WHERE expires_at<=now() ORDER BY expires_at
       LIMIT 500 FOR UPDATE SKIP LOCKED)`);
  });
}
