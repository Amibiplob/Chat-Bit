import { createHmac } from 'node:crypto';
import { MessagingError } from './messaging-validation.mjs';

// Scope/limit come only from server code, never from request bodies.
export async function requestRateLimit(pool, userId, scope, limit, secret) {
  const key=createHmac('sha256',secret).update(`request:${scope}:${userId}`).digest('hex');
  const {rows}=await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
    VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$2+1) END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
    RETURNING attempts`,[key,limit]);
  if(rows[0].attempts>limit) throw new MessagingError('Too many requests. Try again in a minute.',429);
}
