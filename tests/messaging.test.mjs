import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { contentSchema, idSchema, pageSchema, sendMessageSchema, readMessagesSchema, validated } from '../lib/server/messaging-validation.mjs';

test('message content is trimmed, bounded and rejects invalid input', () => {
  assert.equal(validated(contentSchema, '  hello\nworld  '), 'hello\nworld');
  for (const value of ['', '   ', null, 42, 'a'.repeat(10001)]) assert.throws(() => validated(contentSchema, value), { status: 400 });
  assert.equal(validated(contentSchema, 'a'.repeat(10000)).length, 10000);
});

test('identifiers, idempotency keys, cursors and read batches are validated', () => {
  const id = randomUUID();
  for (const value of ['1', "'); DROP TABLE users; --", '', null]) assert.throws(() => validated(idSchema, value), { status: 400 });
  assert.equal(validated(sendMessageSchema, { content: 'hello', clientId: id }).clientId, id);
  assert.throws(() => validated(sendMessageSchema, { content: 'hello' }));
  assert.throws(() => validated(sendMessageSchema, { content: 'hello', clientId: id, replyToId: 'invalid' }));
  for (const limit of [0, 101, 1.5, NaN]) assert.throws(() => validated(pageSchema, { limit }));
  assert.deepEqual(validated(pageSchema, {}), { limit: 50, cursor: null });
  assert.throws(() => validated(pageSchema, { cursor: { id, createdAt: 'yesterday' } }));
  assert.doesNotThrow(() => validated(pageSchema, { cursor: { id, createdAt: '2030-01-01T00:00:00.123456Z' } }));
  assert.throws(() => validated(readMessagesSchema, { messageIds: [] }));
  assert.throws(() => validated(readMessagesSchema, { messageIds: Array(101).fill(id) }));
});
