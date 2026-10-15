import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import * as attachments from '../lib/server/attachment-queries.mjs';
import * as messages from '../lib/server/messaging-queries.mjs';
import { synchronize } from '../lib/server/realtime-queries.mjs';
import { resolveSession } from '../lib/server/session-core.mjs';

test('attachment quotas, authorization, deletion and realtime in isolated PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated isolated database',
}, async (t) => {
  const config = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const schema = `chatbit_files_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool(config); let pool; let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ ...config, options: `-c search_path=${schema}` }); await migrate(pool);
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const [i, id] of [a,b,c].entries()) await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, `file${i}@example.com`, `File ${i}`, '$argon2id$fixture']);
    const conversation = await messages.createConversation(pool, a, { participantId: b });
    const other = await messages.createConversation(pool, a, { participantId: c });
    const file = { filename: 'test.txt', mimeType: 'text/plain', byteSize: 100 };
    let reserved; let message;
    await t.test('authorized reservations use unpredictable paths; unauthorized uploads rejected', async () => {
      reserved = await attachments.reserveAttachment(pool, a, conversation, file);
      assert.ok(reserved.key.startsWith(`${a}/`)); assert.ok(!reserved.key.includes(file.filename));
      await assert.rejects(attachments.reserveAttachment(pool, c, conversation, file), { status: 404 });
      await assert.rejects(attachments.pendingAttachment(pool, a, other, reserved.id), { status: 404 });
      await assert.rejects(attachments.pendingAttachment(pool, b, conversation, reserved.id), { status: 404 });
    });
    await t.test('completion is idempotent and becomes visible through existing revisions', async () => {
      const before = await synchronize(pool, b, { conversationId: conversation });
      const input = { clientId: randomUUID(), caption: '' };
      const results = await Promise.all([attachments.finalizeAttachment(pool, a, conversation, reserved.id, input), attachments.finalizeAttachment(pool, a, conversation, reserved.id, input)]);
      assert.equal(results[0], results[1]); message = results[0];
      const after = await synchronize(pool, b, { conversationId: conversation, revision: before.revision });
      assert.equal(after.page.messages[0].attachments[0].id, reserved.id);
      assert.equal(after.conversations[0].lastMessage, 'Attachment: test.txt');
      assert.equal((await attachments.attachmentForDownload(pool, b, reserved.id)).filename, 'test.txt');
      await assert.rejects(attachments.attachmentForDownload(pool, c, reserved.id), { status: 404 });
      await attachments.failAttachment(pool, a, reserved.id, 'late failure');
      assert.equal((await attachments.pendingAttachment(pool, a, conversation, reserved.id)).uploadState, 'available');
    });
    await t.test('concurrent reservations cannot bypass 100 MB quota, even with undersized declarations', async () => {
      const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => attachments.reserveAttachment(pool, a, conversation, { ...file, byteSize: 1 })));
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 9);
      assert.ok(outcomes.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 413));
    });
    await t.test('expired pending records fail, cleanup failures retry, and late tokens retain tombstones', async () => {
      await pool.query("UPDATE message_attachments SET reserved_until=now()-interval '1 minute' WHERE upload_state='pending'");
      const rows = await attachments.cleanupCandidates(pool); assert.equal(rows.length, 9);
      await assert.rejects(attachments.pendingAttachment(pool, a, conversation, rows[0].id), { status: 409 });
      await attachments.recordCleanup(pool, [rows[0].id], false);
      assert.equal((await pool.query('SELECT cleanup_attempts FROM message_attachments WHERE id=$1', [rows[0].id])).rows[0].cleanup_attempts, 1);
      await attachments.recordCleanup(pool, [rows[0].id], true);
      assert.equal((await pool.query('SELECT upload_state FROM message_attachments WHERE id=$1', [rows[0].id])).rows[0].upload_state, 'failed');
      await pool.query("UPDATE message_attachments SET created_at=now()-interval '4 hours' WHERE upload_state='failed'");
      await attachments.recordCleanup(pool, rows.map((r) => r.id), true);
      assert.ok(await attachments.reserveAttachment(pool, a, conversation, file));
    });
    await t.test('only uploader may delete; deleted attachment and message revoke access', async () => {
      await assert.rejects(attachments.scheduleAttachmentDeletion(pool, b, conversation, reserved.id), { status: 404 });
      await attachments.scheduleAttachmentDeletion(pool, a, conversation, reserved.id);
      await assert.rejects(attachments.attachmentForDownload(pool, b, reserved.id), { status: 404 });
      assert.equal((await messages.getMessagePage(pool, b, conversation)).messages[0].attachments.length, 0);
      const next = await attachments.reserveAttachment(pool, a, conversation, file);
      const id = await attachments.finalizeAttachment(pool, a, conversation, next.id, { clientId: randomUUID(), caption: 'file' });
      await messages.deleteMessage(pool, a, conversation, id);
      await assert.rejects(attachments.attachmentForDownload(pool, b, next.id), { status: 404 });
      assert.equal((await pool.query('SELECT upload_state FROM message_attachments WHERE id=$1', [next.id])).rows[0].upload_state, 'delete_pending');
      assert.ok(message);
    });
    await t.test('expired sessions cannot establish an actor', async () => {
      const token = 'a'.repeat(43);
      const { sessionHash } = await import('../lib/server/session-core.mjs');
      await pool.query("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,now()-interval '2 minutes',now()-interval '1 minute')", [sessionHash(token), b]);
      assert.equal(await resolveSession(pool, token), null);
    });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
