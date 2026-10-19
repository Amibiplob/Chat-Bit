import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = (await readFile(new URL('../lib/messaging-client.ts', import.meta.url), 'utf8')).replaceAll("'./messaging-response.mjs'", JSON.stringify(new URL('../lib/messaging-response.mjs', import.meta.url).href));
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { messagingRequest } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

test('caller cancellation and API timeout both remain active', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const user = new AbortController();
  const deadline = new AbortController();
  let signal;
  AbortSignal.timeout = (duration) => { assert.equal(duration, 30000); return deadline.signal; };
  globalThis.fetch = async (_url, options) => { signal = options.signal; return Response.json({ ok: true }); };
  try {
    await messagingRequest('/local-test', { signal: user.signal });
    assert.notEqual(signal, user.signal);
    deadline.abort(new DOMException('Timed out', 'TimeoutError'));
    assert.equal(signal.aborted, true);
    const another = new AbortController();
    AbortSignal.timeout = () => another.signal;
    await messagingRequest('/local-test', { signal: user.signal });
    user.abort();
    assert.equal(signal.aborted, true);
    assert.equal(another.signal.aborted, false);
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
});
