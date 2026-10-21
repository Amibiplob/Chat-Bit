import { performanceStep } from './connection-performance.mjs';
import { transaction } from './transaction.mjs';
import { idSchema, createConversationSchema, sendMessageSchema, editMessageSchema, readMessagesSchema, pageSchema, searchSchema, validated, MessagingError, unavailableConversation } from './messaging-validation.mjs';

/** @typedef {import('../messaging-types').Conversation} Conversation */
/** @typedef {import('../messaging-types').Message} Message */
/** @typedef {import('../messaging-types').MessagePage} MessagePage */
/** @typedef {import('pg').Pool} Pool */
/** @typedef {import('pg').PoolClient} Client */

/** @param {Client} client @param {string} userId @param {string} conversationId */
async function membership(client, userId, conversationId) {
  const { rowCount } = await client.query('SELECT conversation_id FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 FOR KEY SHARE', [conversationId, userId]);
  if (!rowCount) throw unavailableConversation();
}

const conversationSelect = `
  SELECT c.id, p.id AS "participantId", p.display_name AS name, p.avatar_version AS "avatarVersion",
         CASE WHEN latest.deleted_at IS NOT NULL THEN 'Message deleted' ELSE latest.body END AS "lastMessage",
         COALESCE(latest.created_at,c.created_at) AS "updatedAt",
         (SELECT count(*)::integer FROM messages m WHERE m.conversation_id=c.id
          AND m.sender_id<>$1 AND m.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM message_read_states r WHERE r.message_id=m.id AND r.user_id=$1)) AS unread
  FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
  JOIN users p ON p.id=CASE WHEN c.participant_low=$1 THEN c.participant_high ELSE c.participant_low END
  LEFT JOIN LATERAL (SELECT body,deleted_at,created_at FROM messages
                    WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) latest ON true
  WHERE cm.user_id=$1`;

/** @param {Pool | Client} pool @param {string} userId @param {string | null} conversationId @returns {Promise<Conversation[]>} */
export async function listConversations(pool, userId, conversationId = null) {
  if (conversationId !== null) validated(idSchema, conversationId);
  const { rows } = await pool.query(`${conversationSelect}${conversationId ? ' AND c.id=$2' : ''} ORDER BY "updatedAt" DESC,c.id DESC`, conversationId ? [userId, conversationId] : [userId]);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString(),
    initials: row.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(), color: 'bg-violet-100 text-violet-600' }));
}

/** @param {Pool} pool @param {string} userId @param {unknown} input */
export async function createConversation(pool, userId, input) {
  const { participantId } = validated(createConversationSchema, input);
  if (participantId === userId) throw new MessagingError('Choose another user to start a conversation.');
  return transaction(pool, async (client) => {
    const other = await client.query('SELECT id FROM users WHERE id=$1', [participantId]);
    if (!other.rowCount) throw unavailableConversation();
    const [low, high] = [userId, participantId].sort();
    const { rows } = await client.query(`INSERT INTO conversations (participant_low,participant_high) VALUES ($1,$2)
      ON CONFLICT (participant_low,participant_high) DO UPDATE SET participant_low=EXCLUDED.participant_low RETURNING id`, [low, high]);
    const id = rows[0].id;
    await client.query('INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING', [id, userId, participantId]);
    return /** @type {string} */ (id);
  });
}

/** Search returns only public display names and IDs, never email or credentials.
 * @param {Pool} pool @param {string} userId @param {unknown} query
 * @returns {Promise<import('../messaging-types').SearchUser[]>}
 */
export async function searchUsers(pool, userId, query) {
  const search = validated(searchSchema, query);
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await pool.query(`SELECT id,display_name AS "displayName" FROM users
    WHERE id<>$1 AND (display_name ILIKE $2 OR email=$3) ORDER BY display_name,id LIMIT 20`, [userId, pattern, search.toLowerCase()]);
  return rows;
}

const messageSelect = `SELECT m.id,m.conversation_id AS "conversationId",m.sender_id AS "senderId",u.display_name AS "senderName",
  CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS content,
  to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
  m.edited_at IS NOT NULL AS edited,m.deleted_at IS NOT NULL AS deleted,
  CASE WHEN EXISTS (SELECT 1 FROM message_read_states r WHERE r.message_id=m.id AND r.user_id<>m.sender_id) THEN 'read' ELSE 'sent' END AS status,
  CASE WHEN m.deleted_at IS NULL THEN COALESCE(files.items,'[]'::json) ELSE '[]'::json END AS attachments,
  CASE WHEN reply.id IS NULL THEN NULL ELSE json_build_object('id',reply.id,'senderName',ru.display_name,
     'content',CASE WHEN reply.deleted_at IS NULL THEN reply.body ELSE '' END,'deleted',reply.deleted_at IS NOT NULL) END AS reply
  FROM messages m JOIN users u ON u.id=m.sender_id
  LEFT JOIN messages reply ON reply.id=m.reply_to_id AND reply.conversation_id=m.conversation_id
  LEFT JOIN users ru ON ru.id=reply.sender_id
  LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',a.id,'filename',a.filename,'mimeType',a.mime_type,
    'byteSize',a.byte_size,'available',true) ORDER BY a.created_at,a.id) AS items FROM message_attachments a
    WHERE a.message_id=m.id AND a.conversation_id=m.conversation_id AND a.upload_state='available' AND a.deleted_at IS NULL) files ON true`;

/** Authoritative bounded window: includes arrivals after the oldest loaded row,
 * and refreshes older edits, reply quotes and receipts without event patch races.
 * @param {Client} client @param {string} userId @param {string} conversationId
 * @param {import('../messaging-types').MessageCursor | null} oldest
 * @returns {Promise<MessagePage>} */
export async function readMessageWindow(client, userId, conversationId, oldest) {
  await membership(client, userId, conversationId);
  const limit = oldest ? 1000 : 50;
  const { rows } = await client.query(`${messageSelect} WHERE m.conversation_id=$1
    ${oldest ? 'AND (m.created_at,m.id)>=($3::timestamptz,$4::uuid)' : ''}
    ORDER BY m.created_at DESC,m.id DESC LIMIT $2`, oldest ? [conversationId, limit, oldest.createdAt, oldest.id] : [conversationId, limit]);
  const first = rows.at(-1);
  const older = first ? await client.query('SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id=$1 AND (created_at,id)<($2::timestamptz,$3::uuid)) AS more', [conversationId, first.createdAt, first.id]) : null;
  return { messages: rows.reverse(), nextCursor: older?.rows[0].more ? { createdAt: first.createdAt, id: first.id } : null };
}

/** @param {Pool} pool @param {string} userId @param {string} conversationId @param {unknown} options @returns {Promise<MessagePage>} */
export async function getMessagePage(pool, userId, conversationId, options = {}) {
  validated(idSchema, conversationId);
  const { limit, cursor } = validated(pageSchema, options);
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const { rows } = await client.query(`${messageSelect} WHERE m.conversation_id=$1
      ${cursor ? 'AND (m.created_at,m.id)<($3::timestamptz,$4::uuid)' : ''}
      ORDER BY m.created_at DESC,m.id DESC LIMIT $2`, cursor ? [conversationId, limit + 1, cursor.createdAt, cursor.id] : [conversationId, limit + 1]);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const oldest = page.at(-1);
    return { messages: page.reverse(), nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null };
  });
}

/** @param {Pool} pool @param {string} userId @param {string} conversationId @param {unknown} input */
export async function sendMessage(pool, userId, conversationId, input) {
  validated(idSchema, conversationId);
  const { content, clientId, replyToId = null } = await performanceStep('validation', () => validated(sendMessageSchema, input));
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    if (replyToId) {
      const reply = await client.query('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL FOR SHARE', [replyToId, conversationId]);
      if (!reply.rowCount) throw unavailableConversation();
    }
    const { rows } = await performanceStep('insert', () => client.query(`INSERT INTO messages (conversation_id,sender_id,client_id,body,reply_to_id) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (sender_id,client_id) DO NOTHING RETURNING id`, [conversationId, userId, clientId, content, replyToId]));
    if (rows.length) return /** @type {string} */ (rows[0].id);
    const previous = await client.query(`SELECT id FROM messages WHERE sender_id=$1 AND client_id=$2 AND conversation_id=$3
      AND body=$4 AND reply_to_id IS NOT DISTINCT FROM $5::uuid AND deleted_at IS NULL`, [userId, clientId, conversationId, content, replyToId]);
    if (!previous.rowCount) throw new MessagingError('This submission was already used. Refresh and try again.', 409);
    return /** @type {string} */ (previous.rows[0].id);
  });
}

/** @param {Pool} pool @param {string} userId @param {string} conversationId @param {string} messageId @param {unknown} input */
export async function editMessage(pool, userId, conversationId, messageId, input) {
  validated(idSchema, conversationId); validated(idSchema, messageId);
  const { content } = validated(editMessageSchema, input);
  await transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const { rowCount } = await client.query(`UPDATE messages SET body=$1,edited_at=now() WHERE id=$2
      AND conversation_id=$3 AND sender_id=$4 AND deleted_at IS NULL`, [content, messageId, conversationId, userId]);
    if (!rowCount) throw unavailableConversation();
  });
}

/** @param {Pool} pool @param {string} userId @param {string} conversationId @param {string} messageId */
export async function deleteMessage(pool, userId, conversationId, messageId) {
  validated(idSchema, conversationId); validated(idSchema, messageId);
  await transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const { rowCount } = await client.query('UPDATE messages SET deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND conversation_id=$2 AND sender_id=$3', [messageId, conversationId, userId]);
    if (!rowCount) throw unavailableConversation();
    await client.query(`UPDATE message_attachments SET upload_state='delete_pending',deleted_at=COALESCE(deleted_at,now()),cleanup_after=now()
      WHERE message_id=$1 AND conversation_id=$2 AND uploader_id=$3 AND upload_state='available'`, [messageId, conversationId, userId]);
  });
}

/** Mark only explicitly rendered messages, not unseen messages arriving later.
 * @param {Pool} pool @param {string} userId @param {string} conversationId @param {unknown} input
 */
export async function markMessagesRead(pool, userId, conversationId, input) {
  validated(idSchema, conversationId);
  const { messageIds } = validated(readMessagesSchema, input);
  const ids = [...new Set(messageIds)];
  await transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const { rowCount } = await client.query('SELECT id FROM messages WHERE conversation_id=$1 AND id=ANY($2::uuid[])', [conversationId, ids]);
    if (rowCount !== ids.length) throw unavailableConversation();
    await client.query(`INSERT INTO message_read_states (conversation_id,message_id,user_id)
      SELECT conversation_id,id,$1 FROM messages WHERE conversation_id=$2 AND id=ANY($3::uuid[]) AND sender_id<>$1 AND deleted_at IS NULL
      ON CONFLICT (message_id,user_id) DO NOTHING`, [userId, conversationId, ids]);
  });
}
