import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './transaction.mjs';
import { idSchema, validated, MessagingError, unavailableConversation } from './messaging-validation.mjs';
import { sessionHash, validSessionToken } from './session-core.mjs';
import { listConversations, readMessageWindow } from './messaging-queries.mjs';

const cursorSchema = z.object({ id: idSchema, createdAt: z.iso.datetime() });
export const syncSchema = z.object({
  conversationId: idSchema.nullable().default(null),
  revision: z.string().regex(/^\d{1,19}$/).nullable().default(null),
  oldest: cursorSchema.nullable().default(null),
  force: z.boolean().default(false),
}).strict();
export const activitySchema = z.object({
  tabId: idSchema, sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  conversationId: idSchema.nullable(), typing: z.boolean(), leaving: z.boolean().default(false),
}).strict().refine((value) => !value.typing || value.conversationId !== null);

/** @param {import('pg').Pool} pool @param {string} userId @param {'sync'|'activity'} purpose @param {string} secret */
export async function realtimeRateLimit(pool, userId, purpose, secret) {
  const max = purpose === 'sync' ? 240 : 90;
  const key = createHmac('sha256', secret).update(`realtime:${purpose}:${userId}`).digest('hex');
  const { rows } = await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
    VALUES ($1,1,now()+interval '1 minute') ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$2+1) END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
    RETURNING attempts`, [key, max]);
  if (rows[0].attempts > max) throw new MessagingError('Too many updates. Please wait a minute.', 429);
}

/** @param {import('pg').PoolClient} client @param {string} userId @param {string} conversationId */
async function participant(client, userId, conversationId) {
  const { rows } = await client.query(`SELECT CASE WHEN c.participant_low=$2 THEN c.participant_high ELSE c.participant_low END AS id
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
    WHERE c.id=$1 AND cm.user_id=$2`, [conversationId, userId]);
  if (!rows.length) throw unavailableConversation();
  return /** @type {string} */ (rows[0].id);
}

/** @param {import('pg').Pool} pool @param {string} userId @param {unknown} input
 * @returns {Promise<import('../realtime-types').SyncSnapshot>} */
export async function synchronize(pool, userId, input) {
  const { conversationId, revision, oldest, force } = validated(syncSchema, input);
  return transaction(pool, async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const other = conversationId ? await participant(client, userId, conversationId) : null;
    const { rows } = await client.query('SELECT revision::text FROM realtime_revisions WHERE user_id=$1', [userId]);
    const current = /** @type {string} */ (rows[0]?.revision ?? '0');
    const changed = force || revision !== current;
    let presence = null;
    if (other) {
      const result = await client.query(`SELECT
        COALESCE(bool_or(a.expires_at>now() AND s.expires_at>now()),false) AS online,
        max(a.last_seen) AS "lastSeen",
        COALESCE(bool_or(a.expires_at>now() AND s.expires_at>now() AND a.conversation_id=$2 AND a.typing_until>now()),false) AS typing
        FROM realtime_activity a JOIN sessions s ON s.token_hash=a.session_hash AND s.user_id=a.user_id
        WHERE a.user_id=$1`, [other, conversationId]);
      presence = { ...result.rows[0], lastSeen: result.rows[0].lastSeen?.toISOString() ?? null };
    }
    return { revision: current, conversations: changed ? await listConversations(client, userId) : null,
      page: changed && conversationId ? await readMessageWindow(client, userId, conversationId, oldest) : null, presence };
  });
}

/** Lease ownership is tied to the verified cookie, never a supplied actor.
 * @param {import('pg').Pool} pool @param {string} userId @param {unknown} token @param {unknown} input */
export async function updateActivity(pool, userId, token, input) {
  const { tabId, sequence, conversationId, typing, leaving } = validated(activitySchema, input);
  if (!validSessionToken(token)) throw new MessagingError('Sign in to continue.', 401);
  const hash = sessionHash(/** @type {string} */ (token));
  await transaction(pool, async (client) => {
    const session = await client.query('SELECT token_hash FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE', [hash, userId]);
    if (!session.rowCount) throw new MessagingError('Sign in to continue.', 401);
    if (conversationId) await participant(client, userId, conversationId);
    // Keep departed-tab sequence tombstones beyond the request timeout, so a
    // concurrent new tab cannot evict the fence of a delayed leave/heartbeat.
    const existing = await client.query('SELECT tab_id FROM realtime_activity WHERE session_hash=$1 AND tab_id=$2', [hash, tabId]);
    if (!existing.rowCount) {
      await client.query(`DELETE FROM realtime_activity WHERE session_hash=$1 AND tab_id IN
        (SELECT tab_id FROM realtime_activity WHERE session_hash=$1 AND expires_at<now()-interval '1 minute' ORDER BY last_seen LIMIT 1)`, [hash]);
      const count = await client.query('SELECT count(*)::integer AS count FROM realtime_activity WHERE session_hash=$1', [hash]);
      if (count.rows[0].count >= 10) throw new MessagingError('Too many recent tabs. Close a tab and wait a minute.', 429);
    }
    await client.query(`INSERT INTO realtime_activity(session_hash,tab_id,user_id,conversation_id,expires_at,typing_until,sequence)
      VALUES($1,$2,$3,$4,CASE WHEN $7 THEN now() ELSE now()+interval '25 seconds' END,
        CASE WHEN $5 AND NOT $7 THEN now()+interval '6 seconds' ELSE NULL END,$6)
      ON CONFLICT(session_hash,tab_id) DO UPDATE SET conversation_id=EXCLUDED.conversation_id,last_seen=now(),
        expires_at=EXCLUDED.expires_at,typing_until=EXCLUDED.typing_until,sequence=EXCLUDED.sequence
        WHERE realtime_activity.sequence<EXCLUDED.sequence`, [hash, tabId, userId, conversationId, typing, sequence, leaving]);
  });
  return { success: true };
}
