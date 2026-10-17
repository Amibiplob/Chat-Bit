import { randomUUID } from 'node:crypto';
import { transaction } from './transaction.mjs';
import { MessagingError, idSchema, unavailableConversation, validated } from './messaging-validation.mjs';
import { sharedFilesSchema, USER_ATTACHMENT_QUOTA, finalizeAttachmentSchema, validateAttachmentMetadata } from './attachment-validation.mjs';

async function membership(client, userId, conversationId) {
  const result = await client.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 FOR KEY SHARE', [conversationId, userId]);
  if (!result.rowCount) throw unavailableConversation();
}

export async function reserveAttachment(pool, userId, conversationId, input) {
  validated(idSchema, conversationId);
  const file = validateAttachmentMetadata(input);
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`attachment-quota:${userId}`]);
    await client.query("UPDATE message_attachments SET upload_state='failed',cleanup_after=now() WHERE uploader_id=$1 AND upload_state='pending' AND reserved_until<=now()", [userId]);
    const usage = await client.query(`SELECT COALESCE(sum(CASE WHEN upload_state='available' THEN byte_size ELSE 10485760 END),0)::bigint AS bytes FROM message_attachments
      WHERE uploader_id=$1 AND upload_state <> 'deleted'`, [userId]);
    if (BigInt(usage.rows[0].bytes) + BigInt(10485760) > BigInt(USER_ATTACHMENT_QUOTA)) {
      throw new MessagingError('Your 100 MB attachment quota would be exceeded.', 413);
    }
    const id = randomUUID();
    const key = `${userId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${file.extension}`;
    await client.query(`INSERT INTO message_attachments
      (id,conversation_id,uploader_id,storage_key,filename,mime_type,byte_size,upload_state,reserved_until,cleanup_after)
      VALUES($1,$2,$3,$4,$5,$6,$7,'pending',now()+interval '15 minutes',now()+interval '15 minutes')`,
      [id, conversationId, userId, key, file.filename, file.mimeType, file.byteSize]);
    return { id, key, ...file };
  });
}

/** @param {import("pg").Pool} pool @param {string} userId @param {string} attachmentId @param {string | null} error */
export async function failAttachment(pool, userId, attachmentId, error = null) {
  await pool.query(`UPDATE message_attachments SET upload_state='failed',cleanup_after=now(),cleanup_error=$3
    WHERE id=$1 AND uploader_id=$2 AND upload_state='pending'`, [attachmentId, userId, error?.slice(0, 200) ?? null]);
}

export async function pendingAttachment(pool, userId, conversationId, attachmentId) {
  validated(idSchema, conversationId); validated(idSchema, attachmentId);
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const result = await client.query(`SELECT id,storage_key AS "storageKey",filename,mime_type AS "mimeType",byte_size AS "byteSize",
      upload_state AS "uploadState",message_id AS "messageId",reserved_until AS "reservedUntil"
      FROM message_attachments WHERE id=$1 AND conversation_id=$2 AND uploader_id=$3 FOR UPDATE`, [attachmentId, conversationId, userId]);
    if (!result.rowCount) throw unavailableConversation();
    const row = result.rows[0];
    if (row.uploadState === 'available') return row;
    if (row.uploadState !== 'pending' || row.reservedUntil <= new Date()) throw new MessagingError('The upload reservation expired.', 409);
    return row;
  });
}

export async function finalizeAttachment(pool, userId, conversationId, attachmentId, input) {
  validated(idSchema, conversationId); validated(idSchema, attachmentId);
  input = validated(finalizeAttachmentSchema, input);
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const selected = await client.query(`SELECT id,storage_key AS "storageKey",filename,mime_type AS "mimeType",byte_size AS "byteSize",
      upload_state AS "uploadState",message_id AS "messageId",reserved_until AS "reservedUntil"
      FROM message_attachments WHERE id=$1 AND conversation_id=$2 AND uploader_id=$3 FOR UPDATE`, [attachmentId, conversationId, userId]);
    if (!selected.rowCount) throw unavailableConversation();
    const row = selected.rows[0];
    if (row.uploadState === 'available') return row.messageId;
    if (row.uploadState !== 'pending' || row.reservedUntil <= new Date()) throw new MessagingError('The upload reservation expired.', 409);
    const body = input.caption || `Attachment: ${row.filename}`;
    const inserted = await client.query(`INSERT INTO messages(conversation_id,sender_id,client_id,body)
      VALUES($1,$2,$3,$4) ON CONFLICT(sender_id,client_id) DO NOTHING RETURNING id`, [conversationId, userId, input.clientId, body]);
    const messageId = inserted.rows[0]?.id;
    if (!messageId) throw new MessagingError('This submission was already used. Refresh and try again.', 409);
    await client.query(`UPDATE message_attachments SET message_id=$1,upload_state='available',available_at=now(),reserved_until=NULL,cleanup_after=NULL,cleanup_error=NULL
      WHERE id=$2 AND upload_state='pending'`, [messageId, attachmentId]);
    return messageId;
  });
}

export async function attachmentForDownload(pool, userId, attachmentId) {
  validated(idSchema, attachmentId);
  const result = await pool.query(`SELECT a.storage_key AS "storageKey",a.filename,a.mime_type AS "mimeType",a.byte_size AS "byteSize"
    FROM message_attachments a JOIN conversation_members cm ON cm.conversation_id=a.conversation_id
    JOIN messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id
    WHERE a.id=$1 AND cm.user_id=$2 AND a.upload_state='available' AND a.deleted_at IS NULL AND m.deleted_at IS NULL`, [attachmentId, userId]);
  if (!result.rowCount) throw unavailableConversation();
  return result.rows[0];
}

export async function scheduleAttachmentDeletion(pool, userId, conversationId, attachmentId) {
  validated(idSchema, conversationId); validated(idSchema, attachmentId);
  return transaction(pool, async (client) => {
    await membership(client, userId, conversationId);
    const result = await client.query(`UPDATE message_attachments SET upload_state='delete_pending',deleted_at=now(),cleanup_after=now()
      WHERE id=$1 AND conversation_id=$2 AND uploader_id=$3 AND upload_state IN ('available','pending','failed') RETURNING storage_key AS "storageKey"`, [attachmentId, conversationId, userId]);
    if (!result.rowCount) throw unavailableConversation();
    return result.rows[0].storageKey;
  });
}

export async function cleanupCandidates(pool, limit = 20) {
  await pool.query("UPDATE message_attachments SET upload_state='failed',cleanup_after=now() WHERE id IN (SELECT id FROM message_attachments WHERE upload_state='pending' AND reserved_until<=now() LIMIT 20)");
  const result = await pool.query(`SELECT id,storage_key AS "storageKey" FROM message_attachments
    WHERE upload_state IN ('failed','delete_pending') AND cleanup_after<=now() ORDER BY cleanup_after,id LIMIT $1`, [limit]);
  return result.rows;
}

export async function recordCleanup(pool, ids, success) {
  if (!ids.length) return;
  if (success) await pool.query("UPDATE message_attachments SET upload_state=CASE WHEN created_at < now()-interval '3 hours' THEN 'deleted' ELSE upload_state END,cleanup_after=CASE WHEN created_at < now()-interval '3 hours' THEN NULL ELSE now()+interval '5 minutes' END,cleanup_error=NULL WHERE id=ANY($1::uuid[]) AND upload_state IN ('failed','delete_pending')", [ids]);
  else await pool.query(`UPDATE message_attachments SET cleanup_attempts=cleanup_attempts+1,cleanup_error='Storage removal failed',
    cleanup_after=now()+(LEAST(3600,power(2,LEAST(cleanup_attempts+1,11)))::text||' seconds')::interval WHERE id=ANY($1::uuid[])`, [ids]);
}

/** Membership-scoped metadata only; every content/download still reauthorizes.
 * @param {import("pg").Pool} pool @param {string} userId @param {unknown} input */
export async function sharedAttachments(pool, userId, input = {}) {
  const { kind, cursor } = validated(sharedFilesSchema, input);
  const { rows } = await pool.query(`SELECT a.id,a.filename,a.mime_type AS "mimeType",a.byte_size AS "byteSize",
    a.conversation_id AS "conversationId",to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",true AS available
    FROM message_attachments a JOIN conversation_members cm ON cm.conversation_id=a.conversation_id AND cm.user_id=$1
    JOIN messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id
    WHERE a.upload_state='available' AND a.deleted_at IS NULL AND m.deleted_at IS NULL
    AND ($2='all' OR ($2='media' AND a.mime_type~'^(image|video)/') OR ($2='documents' AND a.mime_type!~'^(image|video)/'))
    ${cursor ? 'AND (a.created_at,a.id)<($3::timestamptz,$4::uuid)' : ''}
    ORDER BY a.created_at DESC,a.id DESC LIMIT 41`,cursor?[userId,kind,cursor.createdAt,cursor.id]:[userId,kind]);
  const items=rows.slice(0,40);
  const last=items.at(-1);
  return {items,nextCursor:rows.length>40&&last?{id:last.id,createdAt:last.createdAt}:null};
}
