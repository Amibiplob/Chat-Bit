// Internal SQL helpers. Call only through the server-only data-access module.
// userId must come from a verified server session, never request input.
/** @param {import('pg').PoolClient} client @param {string} userId @param {string} conversationId @param {number} limit */
export async function readMessages(client, userId, conversationId, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page size');
  const { rows } = await client.query(`
    SELECT m.id, m.sender_id, CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,
           m.reply_to_id, m.created_at, m.edited_at, m.deleted_at
    FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1
    WHERE m.conversation_id = $2
    ORDER BY m.created_at DESC, m.id DESC LIMIT $3
  `, [userId, conversationId, limit]);
  return rows;
}

/** @param {import('pg').PoolClient} client @param {string} userId @param {string} attachmentId */
export async function findPrivateAttachment(client, userId, attachmentId) {
  const { rows } = await client.query(`
    SELECT a.storage_key, a.filename, a.mime_type, a.byte_size
    FROM message_attachments a
    JOIN conversation_members cm ON cm.conversation_id = a.conversation_id AND cm.user_id = $1
    JOIN messages m ON m.id = a.message_id AND m.deleted_at IS NULL
    WHERE a.id = $2 AND a.upload_state='available' AND a.deleted_at IS NULL
  `, [userId, attachmentId]);
  return rows[0] ?? null;
}
