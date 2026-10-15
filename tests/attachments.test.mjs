import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedAttachments, MAX_ATTACHMENT_BYTES, validateAttachmentMetadata as metadata, validateAttachmentContent as content } from '../lib/server/attachment-validation.mjs';
import { attachmentStorage } from '../lib/server/attachment-storage-core.mjs';
import { verifyAndFinalize, reconcileAttachments } from '../lib/server/attachment-workflow.mjs';

const file = { filename: 'photo.png', mimeType: 'image/png', byteSize: 8 };
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
test('attachment metadata allows supported types and exact size boundary', () => {
  for (const [extension, mimeType] of allowedAttachments) assert.equal(metadata({ ...file, filename: `test.${extension}`, mimeType }).extension, extension);
  assert.equal(metadata({ ...file, byteSize: MAX_ATTACHMENT_BYTES }).byteSize, MAX_ATTACHMENT_BYTES);
  for (const byteSize of [0, -1, MAX_ATTACHMENT_BYTES + 1, 1.5]) assert.throws(() => metadata({ ...file, byteSize }));
});
test('rejects unsupported files, traversal, MIME mismatch and spoofed actor fields', () => {
  for (const patch of [{ filename: '../photo.png' }, { filename: 'x\\photo.png' }, { filename: 'x\n.png' }, { filename: 'run.exe' }, { mimeType: 'text/html' }, { uploaderId: 'spoofed' }]) assert.throws(() => metadata({ ...file, ...patch }));
});
test('validates actual bytes, truncated/mismatched files and unsafe plain text', () => {
  content(png, 8, 'image/png', 'png');
  assert.throws(() => content(png, 9, 'image/png', 'png'));
  assert.throws(() => content(png, 8, 'image/jpeg', 'jpg'));
  for (const text of ['MZ executable', '#!/bin/sh', '\0', '\ufffd']) {
    const bytes = text === '\ufffd' ? Uint8Array.from([255]) : new TextEncoder().encode(text);
    assert.throws(() => content(bytes, bytes.length, 'text/plain', 'txt'));
  }
  const bytes = new TextEncoder().encode('Hello world'); content(bytes, bytes.length, 'text/plain', 'txt');
  assert.throws(() => content(Uint8Array.from([80,75,3,4]), 4, allowedAttachments.get('docx'), 'docx'));
});
function provider({ publicBucket = false, cap = MAX_ATTACHMENT_BYTES, fail = false } = {}) {
  const calls = [];
  const files = {
    createSignedUploadUrl: async (...args) => { calls.push(['upload', ...args]); return { data: { signedUrl: 'https://storage.invalid/upload' }, error: fail }; },
    createSignedUrl: async (...args) => { calls.push(['download', ...args]); return { data: { signedUrl: 'https://storage.invalid/download' }, error: fail }; },
    download: async () => ({ data: new Blob([png]), error: fail }),
    remove: async (paths) => { calls.push(['remove', paths]); return { error: fail }; },
  };
  const client = { storage: { from: () => files, getBucket: async () => ({ data: { public: publicBucket, file_size_limit: cap } }) } };
  return { storage: attachmentStorage(client, 'chatbit-attachments'), calls };
}
test('mock Supabase verifies private bucket, scopes non-overwriting uploads, and signs 60-second forced downloads', async () => {
  const { storage, calls } = provider();
  await storage.upload('random/path.png'); await storage.download('random/path.png', 'photo.png');
  assert.deepEqual(calls[0], ['upload', 'random/path.png', { upsert: false }]);
  assert.deepEqual(calls[1], ['download', 'random/path.png', 60, { download: 'photo.png' }]);
  assert.deepEqual(await storage.read('random/path.png'), png);
  for (const config of [{ publicBucket: true }, { cap: 0 }, { cap: MAX_ATTACHMENT_BYTES + 1 }]) await assert.rejects(provider(config).storage.upload('x'));
});
test('mock Supabase failures fail closed', async () => {
  const { storage } = provider({ fail: true });
  for (const operation of [() => storage.upload('x'), () => storage.read('x'), () => storage.download('x', 'x'), () => storage.remove(['x'])]) await assert.rejects(operation());
});
const row = { storageKey: 'private/key.png', filename: 'photo.png', mimeType: 'image/png', byteSize: 8, uploadState: 'pending' };
function workflow(overrides = {}) {
  const events = [];
  const queries = { pendingAttachment: async () => row, finalizeAttachment: async () => { events.push('finalized'); return 'message'; }, failAttachment: async () => { events.push('failed'); }, ...overrides };
  return { queries, events, storage: { read: async () => png }, pool: {}, userId: 'actor', conversationId: 'conversation', attachmentId: 'attachment', input: {} };
}
test('verified completion persists once and available retry skips storage', async () => {
  const options = workflow(); assert.equal(await verifyAndFinalize(options), 'message'); assert.deepEqual(options.events, ['finalized']);
  options.queries.pendingAttachment = async () => ({ ...row, uploadState: 'available', messageId: 'message' });
  options.storage.read = async () => { throw new Error('must not read'); };
  assert.equal(await verifyAndFinalize(options), 'message');
});
test('failed upload, invalid bytes and failed metadata persistence reserve cleanup', async () => {
  for (const kind of ['storage', 'bytes', 'database']) {
    const options = workflow();
    if (kind === 'storage') options.storage.read = async () => { throw new Error('provider down'); };
    if (kind === 'bytes') options.storage.read = async () => new Uint8Array(8);
    if (kind === 'database') options.queries.finalizeAttachment = async () => { throw new Error('database down'); };
    await assert.rejects(verifyAndFinalize(options)); assert.deepEqual(options.events, ['failed']);
  }
});
test('unauthorized completion cannot read storage or finalize', async () => {
  const options = workflow({ pendingAttachment: async () => { throw new Error('not authorized'); } });
  options.storage.read = async () => { assert.fail('unauthorized storage read'); };
  await assert.rejects(verifyAndFinalize(options)); assert.deepEqual(options.events, []);
});
test('bounded cleanup records failures and retries only selected paths', async () => {
  const events = []; let fail = true;
  const queries = { cleanupCandidates: async (_, limit) => { assert.equal(limit, 20); return [{ id: 'id', storageKey: 'own/path' }]; }, recordCleanup: async (_, ids, success) => events.push([ids, success]) };
  const storage = { remove: async (paths) => { assert.deepEqual(paths, ['own/path']); if (fail) throw new Error('offline'); } };
  await reconcileAttachments({}, queries, storage); fail = false; await reconcileAttachments({}, queries, storage);
  assert.deepEqual(events, [[['id'], false], [['id'], true]]);
});

test('media response streams large verified files with fixed security headers', async () => {
  const { attachmentPreviewResponse } = await import('../lib/server/attachment-response.mjs');
  const bytes = new Uint8Array(6 * 1024 * 1024).fill(12);
  const response = attachmentPreviewResponse(bytes, 'video/mp4');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-length'), null);
  const reader = response.body.getReader(); let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    assert.ok(value.length <= 65536); length += value.length;
  }
  assert.equal(length, bytes.length);
});
