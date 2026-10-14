import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { sessionHash } from '../lib/server/session-core.mjs';
import { transaction } from '../lib/server/transaction.mjs';
import * as messages from '../lib/server/messaging-queries.mjs';
import { synchronize, updateActivity, realtimeRateLimit } from '../lib/server/realtime-queries.mjs';
import { completeWindow } from '../lib/realtime-client.mjs';

const input = (conversationId, extra = {}) => ({ conversationId, ...extra });
test('realtime synchronization and session-bound presence in isolated PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL for realtime integration tests',
}, async (t) => {
  const config = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const schema = `chatbit_realtime_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool(config); let pool; let created = false;
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()].sort();
  let conversation; let message; let other;
  const tokenB = randomBytes(32).toString('base64url'); const tokenC = randomBytes(32).toString('base64url');
  const activity = (tabId, sequence, extra = {}) => ({ tabId, sequence, conversationId: conversation, typing: false, ...extra });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ ...config, options: `-c search_path=${schema}` }); await migrate(pool);
    for (const [i, id] of [a, b, c].entries()) await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, `realtime${i}@example.com`, `Realtime ${i}`, '$argon2id$fixture']);
    for (const [id, token] of [[b, tokenB], [c, tokenC]]) await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [sessionHash(token), id]);
    await t.test('new conversations invalidate both authorized lists, not unrelated lists', async () => {
      const before = await synchronize(pool, a, input(null));
      conversation = await messages.createConversation(pool, a, { participantId: b });
      const after = await synchronize(pool, a, input(null, { revision: before.revision }));
      assert.equal(after.conversations[0].id, conversation);
      assert.equal((await synchronize(pool, c, input(null))).conversations.length, 0);
      await assert.rejects(synchronize(pool, c, input(conversation)), { status: 404 });
      other = await messages.createConversation(pool, a, { participantId: c });
      assert.equal((await synchronize(pool, c, input(null))).conversations[0].id, other);
    });
    await t.test('new messages, previews and unread counts recover after delivery failure', async () => {
      const before = await synchronize(pool, b, input(conversation));
      const body = { content: 'Committed before delivery', clientId: randomUUID() };
      message = await messages.sendMessage(pool, a, conversation, body);
      const failedDelivery = await synchronize(pool, b, input(conversation, { revision: before.revision }));
      assert.throws(() => { assert.equal(failedDelivery.page.messages[0].id, message); throw new Error('Delivery unavailable'); });
      const recovered = await synchronize(pool, b, input(conversation, { revision: before.revision }));
      assert.equal(recovered.page.messages[0].content, body.content);
      assert.equal(recovered.conversations[0].unread, 1); assert.equal(recovered.conversations[0].lastMessage, body.content);
      await messages.sendMessage(pool, a, conversation, body);
      assert.equal((await synchronize(pool, b, input(conversation, { revision: recovered.revision }))).page, null);
    });
    await t.test('edits, read receipts and deletions synchronize and repeated reads do not cause loops', async () => {
      let before = await synchronize(pool, b, input(conversation));
      await messages.editMessage(pool, a, conversation, message, { content: 'Changed live' });
      let after = await synchronize(pool, b, input(conversation, { revision: before.revision }));
      assert.equal(after.page.messages[0].content, 'Changed live'); assert.equal(after.conversations[0].lastMessage, 'Changed live');
      await messages.markMessagesRead(pool, b, conversation, { messageIds: [message] });
      after = await synchronize(pool, a, input(conversation)); assert.equal(after.page.messages[0].status, 'read');
      assert.equal(after.conversations.find((row) => row.id === conversation).unread, 0);
      before = await synchronize(pool, b, input(conversation));
      await messages.markMessagesRead(pool, b, conversation, { messageIds: [message] });
      assert.equal((await synchronize(pool, b, input(conversation, { revision: before.revision }))).page, null);
      await messages.deleteMessage(pool, a, conversation, message);
      after = await synchronize(pool, b, input(conversation, { revision: before.revision }));
      assert.equal(after.page.messages[0].content, ''); assert.equal(after.page.messages[0].deleted, true);
      assert.equal(after.conversations[0].lastMessage, 'Message deleted');
    });
    await t.test('uncommitted writes and rollbacks never advance the observed revision', async () => {
      const before = await synchronize(pool, a, input(conversation));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4)', [conversation, a, randomUUID(), 'not committed']);
        const hidden = await synchronize(pool, a, input(conversation, { revision: before.revision }));
        assert.equal(hidden.page, null); assert.equal(hidden.revision, before.revision);
        await client.query('ROLLBACK');
      } finally { client.release(); }
      assert.equal((await synchronize(pool, a, input(conversation))).revision, before.revision);
      await assert.rejects(transaction(pool, async (client) => {
        await client.query('INSERT INTO messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4)', [conversation, a, randomUUID(), 'rollback']);
        throw new Error('abort');
      }));
      assert.equal((await synchronize(pool, a, input(conversation))).revision, before.revision);
    });
    await t.test('loaded history survives synchronization and more than one page of arrivals is recovered', async () => {
      const original = await synchronize(pool, a, input(conversation));
      const oldest = { id: original.page.messages[0].id, createdAt: original.page.messages[0].createdAt };
      for (let i = 0; i < 65; i++) await messages.sendMessage(pool, b, conversation, { content: `Arrival ${i}`, clientId: randomUUID() });
      const after = await synchronize(pool, a, input(conversation, { revision: original.revision, oldest }));
      assert.equal(after.page.messages.length, 66); assert.equal(after.page.messages[0].id, message);
      assert.equal(new Set(after.page.messages.map((row) => row.id)).size, 66);
    });
    await t.test('histories beyond the per-response bound recover through authorized pagination', async () => {
      const original = await synchronize(pool, a, input(conversation));
      const oldestPage = await messages.getMessagePage(pool, a, conversation, { limit: 100 });
      const first = oldestPage.messages[0];
      const oldest = { id: first.id, createdAt: first.createdAt };
      await pool.query(`INSERT INTO messages(conversation_id,sender_id,client_id,body)
        SELECT $1,$2,gen_random_uuid(),'Window row '||i FROM generate_series(1,1005) i`, [conversation, b]);
      const after = await synchronize(pool, a, input(conversation, { revision: original.revision, oldest }));
      assert.equal(after.page.messages.length, 1000); assert.ok(after.page.nextCursor);
      const restored = await completeWindow(after.page, oldest, conversation,
        (cursor) => messages.getMessagePage(pool, a, conversation, { limit: 100, cursor }));
      assert.equal(restored.messages.length, 1071); assert.equal(restored.messages[0].id, oldest.id);
      assert.equal(new Set(restored.messages.map((row) => row.id)).size, 1071);
    });
    await t.test('presence and typing are authorized, expire and remain online across multiple tabs', async () => {
      const tab1 = randomUUID(); const tab2 = randomUUID();
      await updateActivity(pool, b, tokenB, activity(tab1, 1, { typing: true }));
      await updateActivity(pool, b, tokenB, activity(tab2, 1));
      let value = await synchronize(pool, a, input(conversation)); assert.equal(value.presence.online, true); assert.equal(value.presence.typing, true);
      await assert.rejects(updateActivity(pool, c, tokenC, activity(randomUUID(), 1, { typing: true })), { status: 404 });
      await assert.rejects(updateActivity(pool, a, tokenB, activity(randomUUID(), 1)), { status: 401 });
      await pool.query("UPDATE realtime_activity SET typing_until=now()-interval '1 second' WHERE tab_id=$1", [tab1]);
      value = await synchronize(pool, a, input(conversation)); assert.equal(value.presence.typing, false); assert.equal(value.presence.online, true);
      await updateActivity(pool, b, tokenB, activity(tab1, 2, { leaving: true }));
      assert.equal((await synchronize(pool, a, input(conversation))).presence.online, true);
      await pool.query("UPDATE realtime_activity SET expires_at=now()-interval '1 second',typing_until=NULL WHERE tab_id=$1", [tab2]);
      value = await synchronize(pool, a, input(conversation)); assert.equal(value.presence.online, false); assert.ok(value.presence.lastSeen);
    });
    await t.test('delayed activity cannot resurrect a departed tab; session revocation removes its leases', async () => {
      const tab = randomUUID();
      await updateActivity(pool, b, tokenB, activity(tab, 10, { leaving: true }));
      await updateActivity(pool, b, tokenB, activity(tab, 9, { typing: true }));
      assert.equal((await synchronize(pool, a, input(conversation))).presence.online, false);
      await updateActivity(pool, b, tokenB, activity(tab, 11, { typing: true }));
      await updateActivity(pool, b, tokenB, activity(tab, 12, { conversationId: null }));
      assert.equal((await synchronize(pool, a, input(conversation))).presence.typing, false);
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash(tokenB)]);
      assert.equal((await synchronize(pool, a, input(conversation))).presence.online, false);
      assert.equal((await pool.query('SELECT count(*) FROM realtime_activity WHERE user_id=$1', [b])).rows[0].count, '0');
      await assert.rejects(updateActivity(pool, b, tokenB, activity(tab, 13)), { status: 401 });
    });
    await t.test('activity limits serialize across instances and reject malformed input', async () => {
      const secret = 'isolated-realtime-rate-limit-secret';
      const key = createHmac('sha256', secret).update(`realtime:activity:${a}`).digest('hex');
      await pool.query("INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,88,now()+interval '1 minute')", [key]);
      const results = await Promise.allSettled(Array.from({ length: 3 }, () => realtimeRateLimit(pool, a, 'activity', secret)));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
      assert.equal(results.find((result) => result.status === 'rejected').reason.status, 429);
      await assert.rejects(synchronize(pool, a, { conversationId: 'bad' }), { status: 400 });
      await assert.rejects(synchronize(pool, a, { revision: '-1' }), { status: 400 });
      await assert.rejects(updateActivity(pool, c, tokenC, { ...activity(randomUUID(), 1), userId: a }), { status: 400 });
      await assert.rejects(updateActivity(pool, c, tokenC, activity(randomUUID(), 0)), { status: 400 });
    });
    await t.test('tab rotation is bounded and expired sessions immediately stop being present', async () => {
      const tabs = Array.from({ length: 11 }, () => randomUUID());
      const results = await Promise.allSettled(tabs.map((tab) => updateActivity(pool, c, tokenC, activity(tab, 1, { conversationId: other }))));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 10);
      assert.equal(results.find((result) => result.status === 'rejected').reason.status, 429);
      assert.equal((await pool.query('SELECT count(*) FROM realtime_activity WHERE user_id=$1', [c])).rows[0].count, '10');
      assert.equal((await synchronize(pool, a, input(other))).presence.online, true);
      await assert.rejects(synchronize(pool, b, input(other)), { status: 404 });
      await pool.query("UPDATE sessions SET created_at=now()-interval '1 day',expires_at=now()-interval '1 second' WHERE token_hash=$1", [sessionHash(tokenC)]);
      assert.equal((await synchronize(pool, a, input(other))).presence.online, false);
      await assert.rejects(updateActivity(pool, c, tokenC, activity(tabs[0], 2, { conversationId: other })), { status: 401 });
    });
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  }
});
