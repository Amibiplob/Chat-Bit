import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Execute the maintained browser implementation with only transport replaced.
const source = await readFile(new URL('../lib/attachment-client.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source.replace('import { messagingRequest } from "./messaging-client";', 'const messagingRequest = (...args) => globalThis.__attachmentTestRequest(...args);').replaceAll('"./attachment-policy.mjs"', JSON.stringify(new URL('../lib/attachment-policy.mjs', import.meta.url).href)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { uploadAttachment } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('lost completion response retries same reservation and client ID without deletion or duplicate upload', async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  const calls = []; let puts = 0; let completions = 0;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() { puts++; }
    setRequestHeader() {}
    send() { assert.equal(this.timeout, 120000); this.status = 200; queueMicrotask(() => this.onload()); }
  };
  globalThis.__attachmentTestRequest = async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/complete')) { if (++completions === 1) throw new TypeError('Response lost after commit'); return { id: 'same-message' }; }
    assert.equal(options.method, 'POST');
    return { attachmentId: 'reserved', signedUrl: 'https://storage.invalid/private' };
  };
  try {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const attempt = () => uploadAttachment('conversation', file, 'caption', () => {}, new AbortController().signal);
    await assert.rejects(attempt(), /Response lost/);
    assert.deepEqual(await attempt(), { id: 'same-message' });
    assert.equal(puts, 1);
    assert.equal(calls.length, 3);
    assert.equal(calls.some(([, options]) => options.method === 'DELETE'), false);
    assert.equal(JSON.parse(calls[1][1].body).clientId, JSON.parse(calls[2][1].body).clientId);
  } finally { globalThis.XMLHttpRequest = originalXHR; delete globalThis.__attachmentTestRequest; }
});

test('upload timeout cancels pending reservation and never completes a message', async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  const methods = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    setRequestHeader() {}
    send() { queueMicrotask(() => this.ontimeout()); }
  };
  globalThis.__attachmentTestRequest = async (url, options) => { methods.push(options.method); assert.equal(url.endsWith('/complete'), false); return { attachmentId: 'reserved', signedUrl: 'https://storage.invalid/private' }; };
  try {
    await assert.rejects(uploadAttachment('conversation', new File(['hello'], 'note.txt', { type: 'text/plain' }), '', () => {}, new AbortController().signal), /timed out/);
    assert.deepEqual(methods, ['POST', 'DELETE']);
  } finally { globalThis.XMLHttpRequest = originalXHR; delete globalThis.__attachmentTestRequest; }
});

test('direct upload rejection distinguishes authorization, size, busy and provider failure', async () => {
  const originalXHR = globalThis.XMLHttpRequest;
  try {
    for (const [status, message] of [[403,/authorization/],[413,/upload limit/],[429,/busy/],[503,/could not accept/]]) {
      const methods = [];
      globalThis.XMLHttpRequest = class { upload = {}; open() {} setRequestHeader() {} send() { this.status = status; queueMicrotask(() => this.onload()); } };
      globalThis.__attachmentTestRequest = async (url, options) => { methods.push(options.method); assert.equal(url.endsWith('/complete'), false); return { attachmentId: 'reserved', signedUrl: 'https://storage.invalid/private' }; };
      await assert.rejects(uploadAttachment('conversation', new File(['hello'], 'note.txt', { type: 'text/plain' }), '', () => {}, new AbortController().signal), message);
      assert.deepEqual(methods, ['POST','DELETE']);
    }
  } finally { globalThis.XMLHttpRequest = originalXHR; delete globalThis.__attachmentTestRequest; }
});
