import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createSyncLoop, parseSnapshot, completeWindow } from '../lib/realtime-client.mjs';

const conversationId = randomUUID();
const senderId = randomUUID();
const row = (id, content, createdAt = '2026-10-14T00:00:00.000001Z') => ({ id, conversationId, senderId, senderName: 'Person', content, createdAt, edited: false, deleted: false, status: 'sent', reply: null });
const snapshot = (revision, messages = []) => ({ revision, conversations: [], page: { messages, nextCursor: null }, presence: { online: false, typing: false, lastSeen: null } });
async function until(condition) { for (let i = 0; i < 200; i++) { if (condition()) return; await delay(5); } assert.fail('Condition timed out'); }
function options(overrides = {}) {
  return { request: async () => snapshot('1'), getState: () => ({ conversationId, oldest: null }), onSnapshot: () => {}, onStatus: () => {}, onUnauthorized: () => {}, isVisible: () => true, interval: 10, ...overrides };
}

test('snapshot validation rejects malformed/cross-conversation payloads and deduplicates ordered rows', () => {
  const id = randomUUID();
  const later = row(randomUUID(), 'later', '2026-10-14T00:00:00.000002Z');
  const parsed = parseSnapshot(snapshot('12', [later, row(id, 'first'), row(id, 'first')]), conversationId);
  assert.deepEqual(parsed.page.messages.map((message) => message.content), ['first', 'later']);
  assert.throws(() => parseSnapshot(snapshot('12', [{ ...row(id, 'private'), conversationId: randomUUID() }]), conversationId));
  assert.throws(() => parseSnapshot(snapshot('12', [row(id, 'private')]), null));
  assert.throws(() => parseSnapshot({ ...snapshot('12'), page: null }, null));
  assert.throws(() => parseSnapshot({ revision: 'bad' }, conversationId));
});

test('mutation during an in-flight sync discards stale response and serializes a forced recovery', async (t) => {
  const requests = []; const received = [];
  const loop = createSyncLoop(options({ request: (input) => new Promise((resolve) => requests.push({ input, resolve })), onSnapshot: (value) => received.push(value) }));
  t.after(() => loop.stop()); loop.start(); await until(() => requests.length === 1);
  const refreshed = loop.refresh();
  requests[0].resolve(snapshot('1', [row(randomUUID(), 'stale')]));
  await until(() => requests.length === 2);
  assert.equal(received.length, 0); assert.equal(requests[1].input.force, true);
  requests[1].resolve(snapshot('2', [row(randomUUID(), 'fresh')])); await refreshed;
  assert.equal(received.length, 1); assert.equal(received[0].page.messages[0].content, 'fresh');
});

test('failed delivery retries a full authoritative snapshot; duplicate snapshots do not duplicate messages', async (t) => {
  const received = []; const statuses = []; let failed = true; let calls = 0;
  const id = randomUUID();
  const loop = createSyncLoop(options({ request: async (input) => {
    calls++; if (failed) { failed = false; throw new Error('Response lost after commit'); }
    assert.equal(input.force, received.length === 0);
    return snapshot('8', [row(id, 'committed')]);
  }, onSnapshot: (value) => received.push(value), onStatus: (value) => statuses.push(value) }));
  t.after(() => loop.stop()); loop.start(); await until(() => statuses.includes('reconnecting'));
  await loop.refresh(); await until(() => calls >= 3);
  assert.equal(received.at(-1).page.messages.length, 1); assert.equal(received.at(-1).page.messages[0].id, id);
  assert.ok(statuses.includes('connected'));
});

test('hidden tabs suspend requests and resume with a full snapshot', async (t) => {
  let visible = false; let calls = 0;
  const loop = createSyncLoop(options({ isVisible: () => visible, request: async (input) => { calls++; assert.equal(input.force, true); return snapshot('1'); } }));
  t.after(() => loop.stop()); loop.start(); await delay(30); assert.equal(calls, 0);
  visible = true; await loop.refresh(); loop.stop(); assert.equal(calls, 1);
});

test('session rejection stops synchronization and unmount aborts active requests', async (t) => {
  let unauthorized = 0; let calls = 0;
  const loop = createSyncLoop(options({ request: async () => { calls++; throw Object.assign(new Error('Expired'), { status: 401 }); }, onUnauthorized: () => unauthorized++ }));
  t.after(() => loop.stop()); loop.start(); await until(() => unauthorized === 1); await delay(30); assert.equal(calls, 1);
  let signal;
  const pending = createSyncLoop(options({ request: async (_input, abort) => { signal = abort; return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new Error('Aborted')))); } }));
  const promise = pending.refresh(); await until(() => signal); pending.stop(); await assert.rejects(promise); assert.equal(signal.aborted, true);
});

test('bounded snapshot continuation retains older loaded history and rejects stalled pagination', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => row(randomUUID(), `row ${i}`, `2026-10-14T00:00:0${i}.000001Z`));
  const cursor = (message) => ({ id: message.id, createdAt: message.createdAt });
  const initial = { messages: rows.slice(4), nextCursor: cursor(rows[4]) };
  const pages = [{ messages: rows.slice(2, 4), nextCursor: cursor(rows[2]) }, { messages: rows.slice(0, 2), nextCursor: null }];
  const result = await completeWindow(initial, cursor(rows[1]), conversationId, async () => pages.shift());
  assert.deepEqual(result.messages.map((row) => row.content), rows.slice(1).map((row) => row.content));
  assert.deepEqual(result.nextCursor, cursor(rows[1]));
  await assert.rejects(completeWindow(initial, cursor(rows[1]), conversationId, async () => initial), /did not advance/);
});

test('poll cadence subtracts request time without overlapping slow requests', async (t) => {
  let active = 0, maxActive = 0; const starts = [];
  const loop = createSyncLoop(options({ interval: 600, request: async () => {
    starts.push(performance.now()); active++; maxActive=Math.max(maxActive,active);
    await delay(60); active--; return snapshot('1');
  } }));
  t.after(()=>loop.stop()); loop.start(); await until(()=>starts.length>=2); loop.stop();
  assert.equal(maxActive,1);
  assert.ok(starts[1]-starts[0]<650, 'A 60 ms request should not add another full interval');
});
