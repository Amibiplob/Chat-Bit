import { createHmac } from 'node:crypto';
import { transaction } from './transaction.mjs';
import { AuthError } from './auth-validation.mjs';

/** @param {import('pg').Pool} pool @param {'login' | 'register'} operation
 * @param {unknown} email @param {string} clientId @param {string} secret
 */
export async function enforceAuthRateLimit(pool, operation, email, clientId, secret) {
  const normalized = typeof email === 'string' ? email.slice(0, 254).trim().toLowerCase() : 'invalid';
  const seconds = operation === 'login' ? 900 : 3600;
  const buckets = [
    { value: `${operation}:client:${clientId}`, max: operation === 'login' ? 30 : 10 },
    { value: `${operation}:email:${normalized}`, max: operation === 'login' ? 10 : 5 },
  ];
  // Commit counters even when denying access; failure of the store fails closed.
  const allowed = await transaction(pool, async (client) => {
    let allowed = true;
    for (const bucket of buckets) {
      const key = createHmac('sha256', secret).update(bucket.value).digest('hex');
      const { rows } = await client.query(`
        INSERT INTO auth_rate_limits (key_hash, attempts, expires_at)
        VALUES ($1, 1, now() + $2 * interval '1 second')
        ON CONFLICT (key_hash) DO UPDATE SET
          attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1
                          ELSE LEAST(auth_rate_limits.attempts + 1, $3 + 1) END,
          expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at
                            ELSE auth_rate_limits.expires_at END
        RETURNING attempts
      `, [key, seconds, bucket.max]);
      if (rows[0].attempts > bucket.max) {
        allowed = false;
        break;
      }
    }
    return allowed;
  });
  if (!allowed) throw new AuthError('RATE_LIMIT', 'Too many attempts. Please try again later.');
}
