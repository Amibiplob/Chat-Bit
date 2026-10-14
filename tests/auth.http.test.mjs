import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { sessionHash } from '../lib/server/session-core.mjs';

function decode(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

// Submit the real progressive-enhancement form, including React's action metadata.
function actionForm(html, marker, fields = {}) {
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].find(([value]) => value.includes(marker))?.[0];
  assert.ok(form, `Expected form containing ${marker}`);
  const data = new FormData();
  for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
    if (!input.includes('type="hidden"')) continue;
    const name = input.match(/name="([^"]*)"/)?.[1];
    const value = input.match(/value="([^"]*)"/)?.[1] ?? '';
    if (name) data.append(decode(name), decode(value));
  }
  assert.ok([...data.keys()].some((key) => key.startsWith('$ACTION_')));
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

test('real Next.js forms, session cookies and protected HTTP routes', {
  skip: !(process.env.TEST_DATABASE_URL && process.env.TEST_AUTH_HTTP === '1') && 'Set TEST_DATABASE_URL and TEST_AUTH_HTTP=1 for HTTP authentication tests',
  timeout: 180000,
}, async (t) => {
  const settings = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const admin = new pg.Pool(settings);
  const schema = `chatbit_http_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  let pool;
  let child;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
    await migrate(pool);
    const listener = createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const root = fileURLToPath(new URL('../', import.meta.url));
    const tsconfig = JSON.parse(await readFile(new URL('../tsconfig.json', import.meta.url), 'utf8'));
    await mkdir(new URL('../.next/auth-http-test/', import.meta.url), { recursive: true });
    await writeFile(new URL('../.next/auth-http-test/tsconfig.json', import.meta.url), JSON.stringify({
      ...tsconfig,
      compilerOptions: { ...tsconfig.compilerOptions, baseUrl: root },
      include: tsconfig.include.map((pattern) => `${root}/${pattern}`),
      exclude: [`${root}/node_modules`],
    }));
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
    databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
    let startupLog = '';
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: new URL('../', import.meta.url), detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl.toString(), DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify', AUTH_RATE_LIMIT_SECRET: randomUUID().replaceAll('-', ''), VERCEL: '0', NEXT_TELEMETRY_DISABLED: '1', CHATBIT_AUTH_HTTP_TEST: '1' },
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { startupLog = `${startupLog}${chunk}`.slice(-1500); });
    const request = (path, options = {}) => fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.any([t.signal, AbortSignal.timeout(60000)]), ...options });
    let ready = false;
    const deadline = Date.now() + 90000;
    for (let i = 0; i < 60; i++) {
      try { const response = await request('/login'); if (response.status === 200) { ready = true; break; } } catch { /* Wait for startup. */ }
      if (child.exitCode !== null || Date.now() > deadline || t.signal.aborted) break;
      await delay(500);
    }
    assert.ok(ready, `Next.js test server should start: ${startupLog}`);
    const routes = ['/chat', '/chat/1', '/calls', '/contacts', '/settings'];
    await t.test('all protected routes redirect without a valid session, including RSC requests', async () => {
      for (const path of routes) {
        const response = await request(path);
        assert.ok([303, 307].includes(response.status));
        assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login');
      }
      const response = await request('/chat', { headers: { RSC: '1', Cookie: 'chatbit_session=invalid' } });
      assert.ok([303, 307].includes(response.status));
    });
    let cookie;
    const credentials = { name: 'HTTP Test User', email: 'http@example.com', password: 'a strong HTTP passphrase', confirmPassword: 'a strong HTTP passphrase' };
    await t.test('registration form sets an HTTP-only seven-day cookie and redirects to chat', async () => {
      const html = await (await request('/signup')).text();
      const response = await request('/signup', { method: 'POST', headers: { Origin: origin }, body: actionForm(html, 'name="confirmPassword"', credentials) });
      assert.equal(response.status, 303);
      assert.equal(new URL(response.headers.get('location'), origin).pathname, '/chat');
      const setCookie = response.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.match(setCookie, /Max-Age=604800/i);
      cookie = setCookie.split(';')[0];
      const chat = await request('/chat', { headers: { Cookie: cookie } });
      assert.equal(chat.status, 200);
      assert.match(await chat.text(), /HTTP Test User/);
    });
    await t.test('authenticated login and signup pages redirect to chat', async () => {
      for (const path of ['/login', '/signup']) {
        const response = await request(path, { headers: { Cookie: cookie } });
        assert.ok([303, 307].includes(response.status));
        assert.equal(new URL(response.headers.get('location'), origin).pathname, '/chat');
      }
    });
    await t.test('cross-origin registration, login and logout cannot mutate accounts or sessions', async () => {
      const before = (await pool.query('SELECT count(*) FROM sessions')).rows[0].count;
      const html = await (await request('/signup')).text();
      await request('/signup', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: actionForm(html, 'name="confirmPassword"', { ...credentials, email: 'csrf@example.com' }) });
      assert.equal((await pool.query('SELECT count(*) FROM users WHERE email=$1', ['csrf@example.com'])).rows[0].count, '0');
      const loginHtml = await (await request('/login')).text();
      await request('/login', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: actionForm(loginHtml, 'name="password"', credentials) });
      const chatHtml = await (await request('/chat', { headers: { Cookie: cookie } })).text();
      await request('/chat', { method: 'POST', headers: { Origin: 'https://untrusted.example', Cookie: cookie }, body: actionForm(chatHtml, 'Sign out') });
      assert.equal((await pool.query('SELECT count(*) FROM sessions')).rows[0].count, before);
      assert.equal((await request('/chat', { headers: { Cookie: cookie } })).status, 200);
    });
    await t.test('logout form revokes the database session and blocks further access', async () => {
      const html = await (await request('/chat', { headers: { Cookie: cookie } })).text();
      const response = await request('/chat', { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: actionForm(html, 'Sign out') });
      assert.equal(response.status, 303);
      assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
      assert.equal((await pool.query('SELECT count(*) FROM sessions WHERE token_hash=$1', [sessionHash(cookie.split('=')[1])])).rows[0].count, '0');
      assert.equal((await request('/chat', { headers: { Cookie: cookie } })).status, 307);
    });
    await t.test('login form handles invalid credentials and signs in with valid credentials', async () => {
      const html = await (await request('/login')).text();
      const failed = await request('/login', { method: 'POST', headers: { Origin: origin }, body: actionForm(html, 'name="password"', { email: credentials.email, password: 'wrong' }) });
      assert.equal(failed.status, 200);
      assert.equal(failed.headers.get('set-cookie'), null);
      assert.match(await failed.text(), /Invalid email or password/);
      const response = await request('/login', { method: 'POST', headers: { Origin: origin }, body: actionForm(html, 'name="password"', credentials) });
      assert.equal(response.status, 303);
      cookie = response.headers.get('set-cookie').split(';')[0];
      await pool.query("UPDATE sessions SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE token_hash=$1", [sessionHash(cookie.split('=')[1])]);
      assert.equal((await request('/settings', { headers: { Cookie: cookie } })).status, 307);
    });
  } finally {
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
      await stopped;
    }
    await pool?.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  }
});
