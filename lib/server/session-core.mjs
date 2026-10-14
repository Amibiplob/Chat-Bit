import { createHash, randomBytes } from 'node:crypto';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
/** @param {unknown} token @returns {token is string} */
export function validSessionToken(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token); }
/** @param {string} token */
export function sessionHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function sessionCookieName(production = process.env.NODE_ENV === 'production') {
  return production ? '__Host-chatbit_session' : 'chatbit_session';
}
/** @param {Date} expires */
export function sessionCookieOptions(expires, production = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, sameSite: /** @type {const} */ ('lax'), secure: production, path: '/', expires, maxAge: SESSION_SECONDS };
}

/** @param {import('pg').PoolClient} client @param {string} userId @param {string | undefined} previousToken */
export async function createSession(client, userId, previousToken) {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await client.query(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, now() + interval '168 hours') RETURNING expires_at
  `, [sessionHash(token), userId]);
  if (validSessionToken(previousToken)) {
    await client.query('DELETE FROM sessions WHERE token_hash = $1', [sessionHash(previousToken)]);
  }
  return { token, expires: /** @type {Date} */ (rows[0].expires_at) };
}

/** @param {import('pg').Pool | import('pg').PoolClient} database @param {unknown} token */
export async function resolveSession(database, token) {
  if (!validSessionToken(token)) return null;
  const { rows } = await database.query(`
    SELECT u.id, u.email, u.display_name AS "displayName"
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
  `, [sessionHash(token)]);
  return /** @type {{id: string, email: string, displayName: string} | null} */ (rows[0] ?? null);
}

/** @param {import('pg').Pool | import('pg').PoolClient} database @param {unknown} token */
export async function revokeSession(database, token) {
  if (validSessionToken(token)) await database.query('DELETE FROM sessions WHERE token_hash = $1', [sessionHash(token)]);
}
