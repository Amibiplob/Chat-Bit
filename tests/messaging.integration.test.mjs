import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import * as messaging from '../lib/server/messaging-queries.mjs';

test('persistent conversations and messaging in isolated PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL for messaging integration tests',
}, async (t) => {
  const settings = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const schema = `chatbit_messages_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool(settings);
  let pool;
  let created = false;
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()].sort();
  let conversation;
  let other;
  let first;
  let reply;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
    await migrate(pool);
    for (const [i, id] of [a, b, c].entries()) await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, `user${i}@example.com`, `Person ${i}`, '$argon2id$fixture']);
    await t.test('conversation creation is atomic and duplicate pairs converge under concurrency', async () => {
      const results = await Promise.all([
        messaging.createConversation(pool, a, { participantId: b }),
        messaging.createConversation(pool, b, { participantId: a }),
        messaging.createConversation(pool, a, { participantId: b }),
      ]);
      assert.equal(new Set(results).size, 1);
      conversation = results[0];
      assert.equal((await pool.query('SELECT count(*) FROM conversations')).rows[0].count, '1');
      assert.equal((await pool.query('SELECT count(*) FROM conversation_members')).rows[0].count, '2');
      await assert.rejects(messaging.createConversation(pool, a, { participantId: a }), { status: 400 });
      await assert.rejects(messaging.createConversation(pool, a, { participantId: a.toUpperCase() }), { status: 400 });
      await assert.rejects(messaging.createConversation(pool, a, { participantId: randomUUID() }), { status: 404 });
      other = await messaging.createConversation(pool, a, { participantId: c });
    });
    await t.test('listing and user search expose only permitted conversations and public user fields', async () => {
      assert.equal((await messaging.listConversations(pool, a)).length, 2);
      const mine = await messaging.listConversations(pool, b);
      assert.equal(mine.length, 1); assert.equal(mine[0].participantId, a); assert.equal(mine[0].unread, 0);
      assert.equal((await messaging.listConversations(pool, c, conversation)).length, 0);
      const users = await messaging.searchUsers(pool, a, 'Person');
      assert.equal(users.length, 2);
      assert.ok(users.every((u) => !('email' in u) && !('password_hash' in u) && u.id !== a));
      assert.equal((await messaging.searchUsers(pool, a, 'USER1@example.com'))[0].id, b);
      assert.deepEqual(await messaging.searchUsers(pool, a, '%_'), []);
    });
    await t.test('send persists content and retry IDs prevent duplicate submissions', async () => {
      const input = { content: " hello '); DROP TABLE users; -- ", clientId: randomUUID() };
      const ids = await Promise.all([messaging.sendMessage(pool, a, conversation, input), messaging.sendMessage(pool, a, conversation, input)]);
      assert.equal(ids[0], ids[1]); first = ids[0];
      const page = await messaging.getMessagePage(pool, b, conversation);
      assert.equal(page.messages.length, 1); assert.equal(page.messages[0].content, input.content.trim());
      assert.equal(page.messages[0].senderId, a); assert.match(page.messages[0].createdAt, /\.\d{6}Z$/);
      await assert.rejects(messaging.sendMessage(pool, a, conversation, { ...input, content: 'changed' }), { status: 409 });
      await assert.rejects(messaging.sendMessage(pool, a, other, input), { status: 409 });
      assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count, '3');
      assert.equal((await messaging.listConversations(pool, b))[0].unread, 1);
      assert.equal((await messaging.listConversations(pool, b))[0].lastMessage, input.content.trim());
    });
    await t.test('members cannot edit or delete another author and outsiders cannot perform any operation', async () => {
      await assert.rejects(messaging.editMessage(pool, b, conversation, first, { content: 'stolen' }), { status: 404 });
      await assert.rejects(messaging.deleteMessage(pool, b, conversation, first), { status: 404 });
      for (const operation of [
        () => messaging.getMessagePage(pool, c, conversation),
        () => messaging.sendMessage(pool, c, conversation, { content: 'intrusion', clientId: randomUUID() }),
        () => messaging.editMessage(pool, c, conversation, first, { content: 'intrusion' }),
        () => messaging.deleteMessage(pool, c, conversation, first),
        () => messaging.markMessagesRead(pool, c, conversation, { messageIds: [first] }),
        () => messaging.editMessage(pool, a, other, first, { content: 'wrong conversation' }),
      ]) await assert.rejects(operation(), { status: 404 });
    });
    await t.test('replies are constrained to live messages in the authorized conversation', async () => {
      reply = await messaging.sendMessage(pool, b, conversation, { content: 'reply', clientId: randomUUID(), replyToId: first });
      assert.equal((await messaging.getMessagePage(pool, b, conversation)).messages[1].reply.id, first);
      await assert.rejects(messaging.sendMessage(pool, a, other, { content: 'invalid reply', clientId: randomUUID(), replyToId: first }), { status: 404 });
      await assert.rejects(messaging.sendMessage(pool, a, conversation, { content: 'invalid reply', clientId: randomUUID(), replyToId: randomUUID() }), { status: 404 });
    });
    await t.test('editing and soft deletion persist without leaking deleted body in replies or previews', async () => {
      await messaging.editMessage(pool, a, conversation, first, { content: 'updated message' });
      const updated = (await messaging.getMessagePage(pool, a, conversation)).messages[0];
      assert.equal(updated.content, 'updated message'); assert.equal(updated.edited, true);
      await messaging.deleteMessage(pool, a, conversation, first);
      await messaging.deleteMessage(pool, a, conversation, first);
      const page = await messaging.getMessagePage(pool, b, conversation);
      assert.equal(page.messages[0].deleted, true); assert.equal(page.messages[0].content, '');
      assert.equal(page.messages[1].reply.deleted, true); assert.equal(page.messages[1].reply.content, '');
      assert.equal((await pool.query('SELECT body FROM messages WHERE id=$1', [first])).rows[0].body, 'updated message');
      await assert.rejects(messaging.editMessage(pool, a, conversation, first, { content: 'restore' }), { status: 404 });
      await assert.rejects(messaging.sendMessage(pool, b, conversation, { content: 'reply to deleted', clientId: randomUUID(), replyToId: first }), { status: 404 });
      await messaging.deleteMessage(pool, b, conversation, reply);
      assert.equal((await messaging.listConversations(pool, b))[0].lastMessage, 'Message deleted');
    });
    await t.test('read states mark only explicit authorized messages and unread counts stay correct', async () => {
      const seen = await messaging.sendMessage(pool, a, conversation, { content: 'seen', clientId: randomUUID() });
      const unseen = await messaging.sendMessage(pool, a, conversation, { content: 'unseen', clientId: randomUUID() });
      assert.equal((await messaging.listConversations(pool, b))[0].unread, 2);
      await messaging.markMessagesRead(pool, b, conversation, { messageIds: [seen, seen] });
      await messaging.markMessagesRead(pool, b, conversation, { messageIds: [seen] });
      assert.equal((await messaging.listConversations(pool, b))[0].unread, 1);
      const page = await messaging.getMessagePage(pool, a, conversation);
      assert.equal(page.messages.find((m) => m.id === seen).status, 'read');
      assert.equal(page.messages.find((m) => m.id === unseen).status, 'sent');
      const foreign = await messaging.sendMessage(pool, c, other, { content: 'other conversation', clientId: randomUUID() });
      await assert.rejects(messaging.markMessagesRead(pool, b, conversation, { messageIds: [unseen, foreign] }), { status: 404 });
      assert.equal((await messaging.listConversations(pool, b))[0].unread, 1);
      await messaging.markMessagesRead(pool, a, conversation, { messageIds: [unseen] });
      assert.equal((await messaging.listConversations(pool, b))[0].unread, 1);
    });
    await t.test('keyset pagination covers equal-millisecond timestamps without omissions or duplicates', async () => {
      const ids = [];
      for (let i = 0; i < 9; i++) {
        const id = await messaging.sendMessage(pool, a, other, { content: `page ${i}`, clientId: randomUUID() }); ids.push(id);
        await pool.query("UPDATE messages SET created_at='2025-01-01T00:00:00Z'::timestamptz + $1 * interval '1 microsecond' WHERE id=$2", [i, id]);
      }
      const expected = (await pool.query('SELECT id FROM messages WHERE conversation_id=$1 ORDER BY created_at,id', [other])).rows.map((r) => r.id);
      const found = []; let cursor = null;
      do {
        const page = await messaging.getMessagePage(pool, a, other, { limit: 3, cursor });
        found.unshift(...page.messages.map((m) => m.id)); cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(found, expected); assert.equal(new Set(found).size, found.length);
    });
    await t.test('pagination uses the UUID tie-breaker when timestamps are identical', async () => {
      await pool.query("UPDATE messages SET created_at='2025-01-01T00:00:00Z' WHERE conversation_id=$1", [other]);
      const expected = (await pool.query('SELECT id FROM messages WHERE conversation_id=$1 ORDER BY created_at,id', [other])).rows.map((row) => row.id);
      const found = []; let cursor = null;
      do {
        const page = await messaging.getMessagePage(pool, a, other, { limit: 3, cursor });
        found.unshift(...page.messages.map((message) => message.id)); cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(found, expected);
    });
    await t.test('invalid content, IDs, reply values, page sizes and read batches are rejected', async () => {
      await assert.rejects(messaging.sendMessage(pool, a, conversation, { content: ' ', clientId: randomUUID() }), { status: 400 });
      await assert.rejects(messaging.sendMessage(pool, a, conversation, { content: 'a'.repeat(10001), clientId: randomUUID() }), { status: 400 });
      await assert.rejects(messaging.sendMessage(pool, a, '1', { content: 'hello', clientId: randomUUID() }), { status: 400 });
      await assert.rejects(messaging.editMessage(pool, a, conversation, first, { content: '' }), { status: 400 });
      await assert.rejects(messaging.getMessagePage(pool, a, conversation, { limit: 101 }), { status: 400 });
      await assert.rejects(messaging.markMessagesRead(pool, a, conversation, { messageIds: [] }), { status: 400 });
    });
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  }
});
