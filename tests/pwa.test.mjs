import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

test('offline worker fetches private routes without caching them and only falls back on navigation failure', async () => {
  const listeners = {};
  const cached = [];
  const removed = [];
  let claimed = false;
  let offline = false;
  const fallback = new Response('public offline');
  const context = {
    self: { location: { origin: 'https://chatbit.test' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting() {}, clients: { claim() { claimed = true; } } },
    Request: class { constructor(path, options) { this.path = path; this.options = options; } },
    Response,
    URL,
    caches: { keys: async () => ['chatbit-public-offline-v1', 'chatbit-public-offline-v2', 'unrelated-app-cache'], delete: async name => { removed.push(name); return true; }, open: async () => ({ add: async request => cached.push(request) }), match: async path => { assert.equal(path, '/offline.html'); return fallback; } },
    fetch: async () => { if (offline) throw new Error('offline'); return new Response('network'); },
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  await new Promise((resolve, reject) => listeners.install({ waitUntil: promise => promise.then(resolve, reject) }));
  assert.equal(cached.length, 1);
  assert.equal(cached[0].path, '/offline.html');
  assert.equal(cached[0].options.credentials, 'omit');
  await new Promise((resolve, reject) => listeners.activate({ waitUntil: promise => promise.then(resolve, reject) }));
  assert.deepEqual(removed, ['chatbit-public-offline-v1'], 'An update retires only ChatBit public fallback caches');
  assert.equal(claimed, true, 'Existing tabs receive the activated worker');
  let response;
  const event = { request: { method: 'GET', mode: 'navigate', url: 'https://chatbit.test/chat' }, respondWith: value => { response = value; } };
  listeners.fetch(event);
  assert.equal(await (await response).text(), 'network');
  offline = true;
  listeners.fetch(event);
  assert.equal(await response, fallback);
  for (const request of [
    { method: 'GET', mode: 'cors', url: 'https://chatbit.test/api/realtime/sync' },
    { method: 'POST', mode: 'navigate', url: 'https://chatbit.test/chat' },
    { method: 'GET', mode: 'navigate', url: 'https://other.test/' },
  ]) listeners.fetch({ request, respondWith() { assert.fail('API, mutations and external requests must be untouched'); } });
  assert.equal(cached.length, 1);
});
