import { isIP } from 'node:net';
import { AuthError } from './auth-validation.mjs';

/** @param {{get: (name: string) => string | null}} headers */
export function assertSameOrigin(headers) {
  try {
    const origin = new URL(headers.get('origin') ?? '');
    if (['https:', 'http:'].includes(origin.protocol) && origin.host === headers.get('host')) return;
  } catch { /* Reject missing, opaque or malformed origins. */ }
  throw new AuthError('ORIGIN', 'This request could not be verified. Reload the page and try again.');
}

/** Only Vercel's overwritten header is trusted; self-hosting uses a shared bucket.
 * @param {{get: (name: string) => string | null}} headers
 */
export function clientIdentity(headers, vercel = process.env.VERCEL === '1') {
  const ip = vercel ? headers.get('x-vercel-forwarded-for')?.trim() : undefined;
  return ip && isIP(ip) ? ip : 'shared-client';
}

/** @param {NodeJS.ProcessEnv} env */
export function rateLimitSecret(env = process.env) {
  if (env.AUTH_RATE_LIMIT_SECRET && env.AUTH_RATE_LIMIT_SECRET.length >= 32) return env.AUTH_RATE_LIMIT_SECRET;
  if (env.NODE_ENV !== 'production') return 'chatbit-local-development-rate-limit-key';
  throw new Error('AUTH_RATE_LIMIT_SECRET must contain at least 32 characters');
}
