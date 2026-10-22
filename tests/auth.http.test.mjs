import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { createSession, sessionHash } from '../lib/server/session-core.mjs';
import { registerAccount, loginAccount } from '../lib/server/auth-service.mjs';
import { sendMessage } from '../lib/server/messaging-queries.mjs';
import { reserveAttachment, finalizeAttachment } from '../lib/server/attachment-queries.mjs';
import { withBrowser } from './helpers/browser.mjs';
import { browserJourney } from './helpers/journey.mjs';
import { frontendJourney } from './helpers/frontend.mjs';

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
  timeout: 600000,
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
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL);
    databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
    let startupLog = '';
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', process.env.TEST_NEXT_TURBOPACK === '1' ? '--turbopack' : '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: new URL('../', import.meta.url), detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl.toString(), DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify', AUTH_RATE_LIMIT_SECRET: randomUUID().replaceAll('-', ''), VERCEL: '0', NEXT_TELEMETRY_DISABLED: '1', CHATBIT_AUTH_HTTP_TEST: '1', CHATBIT_REALTIME_PROVIDER:'', ABLY_API_KEY:'', CALL_STUN_URLS: '[]', CALL_TURN_URLS: '[]', CALL_TURN_SHARED_SECRET: '', CALL_RELAY_ONLY: '0', CRON_SECRET:'', MAINTENANCE_CLEANUP_SECRET:'', ATTACHMENT_CLEANUP_SECRET:'', CALL_CLEANUP_SECRET:'', AWS_ENDPOINT_URL_S3:'', AWS_ACCESS_KEY_ID:'', AWS_SECRET_ACCESS_KEY:'' },
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
    await t.test('security headers preserve first-party media and cleanup endpoints reject missing credentials',async()=>{
      const response=await request('/login');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(response.headers.get('x-frame-options'),'DENY');
      assert.equal(response.headers.get('referrer-policy'),'no-referrer');
      assert.ok(response.headers.get('permissions-policy').includes('camera=(self), microphone=(self)'));
      assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
      assert.equal(response.headers.get('x-powered-by'),null);
      for(const path of ['/api/maintenance/cleanup','/api/attachments/cleanup','/api/calls/cleanup']) {
        for(const method of ['GET','POST']) assert.equal((await request(path,{method})).status,401);
      }
    });
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
    await t.test('public form validation, duplicate submissions, mobile navigation and themes', {
      skip: !process.env.CHROME_BIN && 'Set CHROME_BIN for public frontend browser checks',
    }, () => frontendJourney(origin));
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
    await t.test('messaging HTTP endpoints enforce sessions, membership and author permissions', async (messageTest) => {
      const context = () => ({ clientId: randomUUID(), secret: 'isolated-http-test-rate-limit-secret' });
      const a = await loginAccount(pool, credentials, context());
      const b = await registerAccount(pool, { name: 'Messaging Partner', email: 'partner@example.com', password: 'another strong passphrase' }, context());
      const c = await registerAccount(pool, { name: 'Unrelated Person', email: 'outsider@example.com', password: 'another strong passphrase' }, context());
      const actor = (session) => `chatbit_session=${session.token}`;
      const api = async (path, session, method = 'GET', body, customOrigin = origin) => {
        const response=await request(path, {
        method, headers: { ...(session ? { Cookie: actor(session) } : {}), ...(method !== 'GET' ? { Origin: customOrigin, 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if(response.status!==405 && !(response.ok && response.headers.get('content-type')?.startsWith('image/'))) {
          assert.ok(response.headers.get('content-type')?.includes('application/json'),`${method} ${path} should return JSON (status ${response.status})`);
        }
        return response;
      };
      assert.equal((await api('/api/conversations', null)).status, 401);
      assert.equal((await api('/api/users?q=Partner', null)).status, 401);
      const users = await (await api('/api/users?q=Partner', a)).json();
      assert.equal(users.length, 1);
      assert.deepEqual(Object.keys(users[0]).sort(), ['displayName', 'id']);
      const participantId = users[0].id;
      const started = await api('/api/conversations', a, 'POST', { participantId });
      assert.equal(started.status, 200);
      const { id } = await started.json();
      assert.equal((await (await api('/api/conversations', a, 'POST', { participantId })).json()).id, id);
      const me = (await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1', [sessionHash(a.token)])).rows[0].user_id;
      assert.equal((await api('/api/conversations', a, 'POST', { participantId: me })).status, 400);
      await messageTest.test('push token endpoint requires same-origin session and matching account even while disabled',async()=>{
        const tokenRequest=(session,expected,requestOrigin=origin)=>request('/api/realtime/token',{method:'POST',headers:{Origin:requestOrigin,...(session?{Cookie:actor(session)}:{}),...(expected?{'X-ChatBit-Account':expected}:{})}});
        assert.equal((await tokenRequest(null,me)).status,401);
        assert.equal((await tokenRequest(a,participantId)).status,401);
        assert.equal((await tokenRequest(a,null)).status,401);
        assert.equal((await tokenRequest(a,me,'https://untrusted.example')).status,403);
        const disabled=await tokenRequest(a,me);assert.equal(disabled.status,200);assert.deepEqual(await disabled.json(),{enabled:false});
        assert.equal(disabled.headers.get('cache-control'),'no-store');
      });
      const base = `/api/conversations/${id}`;
      const syncPath = (state) => `/api/realtime/sync?state=${encodeURIComponent(JSON.stringify(state))}`;
      assert.equal((await api(syncPath({ conversationId: id }), null)).status, 401);
      assert.equal((await api(syncPath({ conversationId: id }), c)).status, 404);
      assert.equal((await api(syncPath({ conversationId: 'invalid' }), a)).status, 400);
      const unauthorizedActivity = { tabId: randomUUID(), sequence: 1, conversationId: id, typing: true };
      assert.equal((await api('/api/realtime/activity', c, 'POST', unauthorizedActivity)).status, 404);
      assert.equal((await api('/api/realtime/activity', null, 'POST', unauthorizedActivity)).status, 401);
      assert.equal((await api('/api/realtime/activity', a, 'POST', { ...unauthorizedActivity, userId: participantId })).status, 400);
      assert.equal((await api('/api/realtime/activity', a, 'POST', unauthorizedActivity, 'https://untrusted.example')).status, 403);
      assert.equal((await (await api(`${base}/messages`, a)).json()).messages.length, 0);
      assert.match(await (await request(`/chat/${id}`, { headers: { Cookie: actor(a) } })).text(), /No messages yet/);
      const clientId = randomUUID();
      const input = { content: 'Persisted over HTTP', clientId, senderId: participantId };
      assert.equal((await api(`${base}/messages`, null, 'POST', input)).status, 401);
      const sent = await api(`${base}/messages`, a, 'POST', input);
      assert.equal(sent.status, 200);
      const messageId = (await sent.json()).id;
      assert.equal((await (await api(`${base}/messages`, a, 'POST', input)).json()).id, messageId);
      const page = await (await api(`${base}/messages`, b)).json();
      assert.equal(page.messages[0].senderId, me);
      assert.equal(page.messages[0].content, input.content);
      assert.equal((await (await api('/api/conversations', b)).json())[0].unread, 1);
      assert.equal((await api(`${base}/messages`, c)).status, 404);
      assert.equal((await api(`${base}/messages`, c, 'POST', { content: 'intrusion', clientId: randomUUID() })).status, 404);
      assert.equal((await api(`${base}/messages/${messageId}`, b, 'PATCH', { content: 'stolen' })).status, 404);
      assert.equal((await api(`${base}/messages/${messageId}`, b, 'DELETE')).status, 404);
      assert.equal((await api(`${base}/read`, c, 'POST', { messageIds: [messageId] })).status, 404);
      assert.equal((await api(`${base}/messages`, a, 'POST', { content: 'bad origin', clientId: randomUUID() }, 'https://untrusted.example')).status, 403);
      assert.equal((await api(`${base}/messages/${messageId}`, a, 'PATCH', { content: 'bad origin' }, 'https://untrusted.example')).status, 403);
      assert.equal((await api(`${base}/messages/${messageId}`, a, 'DELETE', undefined, 'https://untrusted.example')).status, 403);
      assert.equal((await api(`${base}/read`, b, 'POST', { messageIds: [messageId] }, 'https://untrusted.example')).status, 403);
      assert.equal((await api(`${base}/messages`, a, 'POST', { content: ' '.repeat(3), clientId: randomUUID() })).status, 400);
      assert.equal((await api(`${base}/messages`, a, 'POST', { content: 'x'.repeat(70000), clientId: randomUUID() })).status, 413);
      assert.equal((await api(`${base}/messages?limit=101`, a)).status, 400);
      assert.equal((await api('/api/conversations/invalid/messages', a)).status, 400);
      const html = await (await request(`/chat/${id}`, { headers: { Cookie: actor(a) } })).text();
      assert.match(html, /Persisted over HTTP/);
      assert.match(html, /Messaging Partner/);
      const unauthorizedHtml = await (await request(`/chat/${id}`, { headers: { Cookie: actor(c) } })).text();
      assert.match(unauthorizedHtml, /Conversation not found/);
      assert.doesNotMatch(unauthorizedHtml, /Persisted over HTTP/);
      await api(`${base}/messages/${messageId}`, a, 'PATCH', { content: 'Edited over HTTP' });
      assert.equal((await (await api(`${base}/messages`, b)).json()).messages[0].content, 'Edited over HTTP');
      const reply = await api(`${base}/messages`, b, 'POST', { content: 'Reply over HTTP', clientId: randomUUID(), replyToId: messageId });
      assert.equal(reply.status, 200);
      const latest = await (await api(`${base}/messages?limit=1`, a)).json();
      assert.equal(latest.messages.length, 1);
      assert.equal(latest.messages[0].reply.id, messageId);
      const earlier = await (await api(`${base}/messages?limit=1&cursor=${encodeURIComponent(JSON.stringify(latest.nextCursor))}`, a)).json();
      assert.equal(earlier.messages[0].id, messageId);
      assert.equal((await api(`${base}/read`, b, 'POST', { messageIds: [messageId], userId: me })).status, 200);
      assert.equal((await (await api('/api/conversations', b)).json())[0].unread, 0);
      assert.equal((await (await api(`${base}/messages`, a)).json()).messages[0].status, 'read');
      await api(`${base}/messages/${messageId}`, a, 'DELETE');
      const deleted = await (await api(`${base}/messages`, b)).json();
      assert.equal(deleted.messages[0].deleted, true);
      assert.equal(deleted.messages[0].content, '');
      assert.equal(deleted.messages[1].reply.deleted, true);
      assert.equal(deleted.messages[1].reply.content, '');
      await messageTest.test('known session expiry removes the workspace while authenticated APIs are stalled',{
        skip:!process.env.CHROME_BIN&&'Requires Chrome',
      },async()=>{
        const expiring=await createSession(pool,me);
        await pool.query("UPDATE sessions SET expires_at=now()+interval '8 seconds' WHERE token_hash=$1",[sessionHash(expiring.token)]);
        await withBrowser(async({command,evaluate,waitFor})=>{
          await command('Page.addScriptToEvaluateOnNewDocument',{source:`const original=window.fetch;window.fetch=(...args)=>String(args[0]).startsWith('/api/')?new Promise(()=>{}):original(...args);`});
          await command('Network.setCookie',{name:'chatbit_session',value:expiring.token,url:origin,httpOnly:true,sameSite:'Lax'});
          await command('Page.navigate',{url:origin+'/settings'});
          await waitFor(`document.querySelector('[data-workspace-panel="/settings"]')`);
          await waitFor(`!document.querySelector('.cb-app-shell')`);
          assert.equal(await evaluate(`Boolean(document.querySelector('[data-workspace-panel]'))`),false);
        });
      });
      await messageTest.test('settings APIs authorize actors and persist profile/preferences',async()=> {
        assert.equal((await api('/api/settings',null)).status,401);
        assert.equal((await api('/api/settings',a,'PATCH',{displayName:'Spoofed',bio:'',userId:randomUUID()})).status,400);
        assert.equal((await api('/api/settings',a,'PATCH',{displayName:'Changed',bio:''},'https://untrusted.example')).status,403);
        const {default:sharp}=await import('sharp');
        const image=await sharp({create:{width:3,height:3,channels:3,background:'#336699'}}).png().toBuffer();
        const avatarRequest=(session,body,customOrigin=origin)=>request('/api/settings/avatar',{method:'POST',headers:{Cookie:actor(session),Origin:customOrigin,'Content-Type':'image/png'},body});
        assert.equal((await avatarRequest(a,image,'https://untrusted.example')).status,403);
        assert.equal((await avatarRequest(a,Buffer.alloc(262145))).status,413);
        assert.equal((await avatarRequest(a,Buffer.alloc(40))).status,400);
        assert.equal((await avatarRequest(a,image)).status,200);
        assert.equal((await api(`/api/avatars/${me}`,b)).status,200);
        assert.equal((await api(`/api/avatars/${me}`,c)).status,404);
        assert.equal((await api(`/api/avatars/${me}`,null)).status,401);
        assert.equal((await api('/api/settings/avatar',a,'DELETE')).status,200);
        const before=await (await api('/api/settings',a)).json();
        const updated=await api('/api/settings',a,'PATCH',{displayName:before.displayName,bio:'Private HTTP biography'});assert.equal(updated.status,200);
        assert.equal((await updated.json()).bio,'Private HTTP biography');
        const prefs={notifyMessages:false,notifyCalls:false,showOnline:false,showLastSeen:false};
        assert.equal((await api('/api/settings',a,'PUT',prefs)).status,200);
        const persisted=await (await api('/api/settings',a)).json();assert.equal(persisted.showOnline,false);
        assert.equal((await api('/api/settings/password',a,'POST',{currentPassword:'wrong',newPassword:'a new passphrase',confirmPassword:'a new passphrase'})).status,403);
        assert.equal((await api('/api/settings/sessions',a,'POST',{currentPassword:'wrong'})).status,403);
        assert.equal((await api('/api/settings',a,'DELETE')).status,405);
        // Leave the subsequent existing presence/browser checks at their defaults.
        await api('/api/settings',a,'PUT',{notifyMessages:true,notifyCalls:true,showOnline:true,showLastSeen:true});
      });
      await messageTest.test('settings browser theme, profile feedback, keyboard labels and responsive navigation',{
        skip:!process.env.CHROME_BIN && 'Set CHROME_BIN for settings browser checks',
      },async()=> {
        await withBrowser(async({command,evaluate,waitFor})=>{
          await command('Network.setCookie',{name:'chatbit_session',value:a.token,url:origin,httpOnly:true,sameSite:'Lax'});
          await command('Page.navigate',{url:`${origin}/settings`});
          await waitFor(`document.querySelector('#display-name') && Object.keys(document.querySelector('#display-name')).some(k=>k.startsWith('__reactFiber$'))`);
          assert.equal(await evaluate(`document.querySelector('#display-name').value`),'HTTP Test User');
          await evaluate(`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(document.querySelector('#bio'),'Saved from browser');document.querySelector('#bio').dispatchEvent(new Event('input',{bubbles:true}))`);
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save profile').click()`);
          await waitFor(`document.body.innerText.includes('Profile saved.')`);
          const navigate=async label=>{await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}) && b.closest('aside')).click()`);};
          await navigate('Appearance');await waitFor(`document.querySelector('button[aria-pressed]')`);
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Dark').click()`);
          assert.equal(await evaluate(`document.documentElement.classList.contains('dark')`),true);
          await command('Page.reload');await waitFor(`document.querySelector('#display-name') && Object.keys(document.querySelector('#display-name')).some(k=>k.startsWith('__reactFiber$'))`);
          assert.equal(await evaluate(`document.documentElement.classList.contains('dark')`),true);
          await navigate('Appearance');await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='System').click()`);
          await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
          await waitFor(`document.documentElement.classList.contains('dark')`);
          await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
          await waitFor(`!document.documentElement.classList.contains('dark')`);
          for(const [width,height] of [[320,568],[390,844],[430,932],[768,1024],[1280,800],[568,320],[844,390],[1024,768]]) {
            await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:Math.min(width,height)<768});
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Settings fits ${width}px`);
          }
          await navigate('Privacy');await waitFor(`document.body.innerText.includes('Show online status')`);
          assert.equal(await evaluate(`document.querySelectorAll('input[type="checkbox"]').length`),2);
          await navigate('Security');await waitFor(`document.querySelector('input[autocomplete="new-password"]')`);
          assert.ok(await evaluate(`Array.from(document.querySelectorAll('input[type="password"]')).every(input=>input.closest('label'))`));
          await evaluate(`document.querySelector('input[type="password"]').focus()`);
          assert.equal(await evaluate(`document.activeElement.type`),'password');
          await navigate('Account');assert.ok(await evaluate(`document.body.innerText.includes('Account deletion — unavailable')`));
          await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
          await evaluate(`document.querySelector('nav[aria-label="Mobile navigation"] a[href="/chat"]').click()`);
          await waitFor(`location.pathname==='/chat'`);
          assert.ok(await evaluate(`Boolean(document.querySelector('nav[aria-label="Mobile navigation"] a[href="/calls"]'))`));
        });
      });
      await messageTest.test('calling HTTP authorization and hydrated controls with mocked media', {
        skip: !process.env.CHROME_BIN && 'Set CHROME_BIN for calling browser checks',
      }, async () => {
        assert.equal((await api('/api/calls', null)).status, 401);
        assert.equal((await api('/api/calls', a, 'POST', {conversationId:id,clientId:randomUUID(),tabId:randomUUID(),kind:'voice'}, 'https://untrusted.example')).status, 403);
        const mock = `(() => {
          window.__captured=[];window.__stopped=0;
          Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints=>{
            const context=new AudioContext();const oscillator=context.createOscillator();const destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();
            const stream=destination.stream;
            if(constraints.video){const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;stream.addTrack(canvas.captureStream(10).getVideoTracks()[0]);}
            for(const track of stream.getTracks()){const original=track.stop.bind(track);track.stop=()=>{window.__stopped++;original();void context.close().catch(()=>{});};}
            window.__captured.push(stream);return stream;
          }});
          window.RTCPeerConnection=class {
            connectionState='new';localDescription=null;remoteDescription=null;
            constructor(){window.__peer=this;}
            addTrack(){} close(){this.closed=true;}
            async createOffer(){return {type:'offer',sdp:'v=0\\r\\n'};}
            async createAnswer(){return {type:'answer',sdp:'v=0\\r\\n'};}
            async setLocalDescription(value){this.localDescription={...value,toJSON:()=>value};}
            async setRemoteDescription(value){this.remoteDescription=value;this.ontrack?.({track:window.__captured.at(-1).getAudioTracks()[0].clone()});this.connectionState='connected';this.onconnectionstatechange?.();}
            async addIceCandidate(){}
          };
        })()`;
        await withBrowser(async ({command,evaluate,waitFor})=>{
          await command('Network.setCookie',{name:'chatbit_session',value:a.token,url:origin,httpOnly:true,sameSite:'Lax'});
          await command('Page.addScriptToEvaluateOnNewDocument',{source:mock});
          await command('Page.navigate',{url:`${origin}/chat/${id}`});
          await waitFor(`document.querySelector('[aria-label="Start audio call"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')??{}).some(key=>key.startsWith('__reactFiber$'))`);
          assert.equal(await evaluate('window.__captured.length'),0);
          await evaluate(`document.querySelector('[aria-label="Start audio call"]').click()`);
          await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('Ringing')`);
          let call=(await (await api('/api/calls',a)).json())[0];const recipientTab=randomUUID();
          assert.equal((await api(`/api/calls/${call.id}`,c,'POST',{tabId:randomUUID(),action:'accept'})).status,404);
          assert.equal((await api(`/api/calls/${call.id}/signals`,c,'POST',{tabId:randomUUID(),clientId:randomUUID(),signal:{kind:'ice',payload:{candidate:'injected'}}})).status,404);
          assert.equal((await api(`/api/calls/${call.id}`,b,'POST',{tabId:recipientTab,action:'accept'})).status,200);
          await waitFor(`window.__peer?.localDescription?.type==='offer'`);
          assert.equal((await api(`/api/calls/${call.id}/signals`,b,'POST',{tabId:recipientTab,clientId:randomUUID(),signal:{kind:'answer',payload:{type:'answer',sdp:'v=0\r\n'}}})).status,200);
          await waitFor(`document.querySelector('[role="status"]')?.textContent.includes('Connected') || document.querySelector('[role="dialog"]')?.textContent.includes('Connected')`);
          await evaluate(`document.querySelector('[aria-label="Mute microphone"]').click()`);
          assert.equal(await evaluate('window.__captured[0].getAudioTracks()[0].enabled'),false);
          await evaluate(`document.querySelector('[aria-label="Unmute microphone"]').click()`);
          assert.equal(await evaluate('window.__captured[0].getAudioTracks()[0].enabled'),true);
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='End call').click()`);
          await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Close call' && !b.disabled)`);
          assert.ok(await evaluate('window.__stopped>=1 && window.__peer.closed'));
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Close call').click()`);
          const incomingTab=randomUUID();const invitation=await api('/api/calls',b,'POST',{conversationId:id,kind:'video',clientId:randomUUID(),tabId:incomingTab});assert.equal(invitation.status,200);call=await invitation.json();
          await waitFor(`document.querySelector('[aria-label="Incoming call"]')`);
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Accept call')).click()`);
          await waitFor(`window.__captured.length===2 && window.__captured[1].getVideoTracks().length===1`);
          assert.equal((await api(`/api/calls/${call.id}/signals`,b,'POST',{tabId:incomingTab,clientId:randomUUID(),signal:{kind:'offer',payload:{type:'offer',sdp:'v=0\r\n'}}})).status,200);
          await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('Connected')`);
          await evaluate(`document.querySelector('[aria-label="Disable camera"]').click()`);
          assert.equal(await evaluate('window.__captured[1].getVideoTracks()[0].enabled'),false);
          await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
          await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='End call').click()`);
          await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Close call' && !b.disabled)`);
          assert.ok(await evaluate('window.__stopped>=3'));
        });
      });
      await messageTest.test('two isolated browsers exchange native WebRTC audio and video using synthetic devices', {
        skip: !process.env.CHROME_BIN && 'Set CHROME_BIN for genuine local WebRTC checks',
      }, async () => {
        const flags=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'];
        await withBrowser(async (caller)=> {
          await withBrowser(async (recipient)=> {
            const source=`window.__peers=[];const NativePeer=window.RTCPeerConnection;window.RTCPeerConnection=class extends NativePeer{constructor(config){super(config);window.__peers.push(this);}};`;
            for(const [browser,session] of [[caller,a],[recipient,b]]) {
              await browser.command('Network.setCookie',{name:'chatbit_session',value:session.token,url:origin,httpOnly:true,sameSite:'Lax'});
              await browser.command('Page.addScriptToEvaluateOnNewDocument',{source});
              await browser.command('Page.navigate',{url:`${origin}/chat/${id}`});
              await browser.waitFor(`document.querySelector('[aria-label="Start video call"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')??{}).some(key=>key.startsWith('__reactFiber$'))`);
            }
            await caller.evaluate(`document.querySelector('[aria-label="Start video call"]').click()`);
            await recipient.waitFor(`document.querySelector('[aria-label="Incoming call"]')`);
            await recipient.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Accept call')).click()`);
            for(const browser of [caller,recipient]) {
              await browser.waitFor(`window.__peers[0]?.connectionState==='connected'`);
              await browser.waitFor(`window.__peers[0].getStats().then(stats=>Array.from(stats.values()).some(row=>row.type==='inbound-rtp' && row.kind==='video' && row.bytesReceived>0))`);
              assert.ok(await browser.evaluate(`document.querySelector('video[aria-label="Remote media"]').srcObject.getAudioTracks().length===1`));
              assert.ok(await browser.evaluate(`document.querySelector('video[aria-label="Remote media"]').srcObject.getVideoTracks().length===1`));
            }
            await caller.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='End call').click()`);
            await recipient.waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Close call' && !b.disabled)`);
            for(const browser of [caller,recipient]) assert.equal(await browser.evaluate(`window.__peers[0].connectionState`),'closed');
          },flags);
        },flags);
      });
      await messageTest.test('hydrated messaging UI preserves drafts, persists edits and works on mobile', {
        skip: !process.env.CHROME_BIN && 'Set CHROME_BIN to run real-browser messaging checks',
      }, async () => {
        const diagnostic = (phase) => { if (process.env.DEBUG_CHATBIT_BROWSER === '1') console.log(`Messaging browser: ${phase}`); };
        for (let i = 0; i < 55; i++) await sendMessage(pool, me, id, { content: `Browser older message ${i}`, clientId: randomUUID() });
        diagnostic('fixture seeded');
        await withBrowser(async ({ command, evaluate, waitFor, fill }) => {
          await command('Network.setCookie', { name: 'chatbit_session', value: a.token, url: origin, httpOnly: true, sameSite: 'Lax' });
          await command('Page.navigate', { url: `${origin}/chat/${id}` });
          await waitFor(`document.querySelector('textarea[aria-label="Message"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')).some(key=>key.startsWith('__reactFiber$')) && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('conversation hydrated');
          await evaluate('window.__chatbitRealtimeMarker=true');
          const partnerTab = randomUUID();
          await api('/api/realtime/activity', b, 'POST', { tabId: partnerTab, sequence: 1, conversationId: id, typing: true });
          await waitFor(`document.body.innerText.includes('Typing…')`);
          diagnostic('typing and presence synchronized');
          const liveInput = { content: 'Automatic incoming message', clientId: randomUUID() };
          const liveId = (await (await api(`${base}/messages`, b, 'POST', liveInput)).json()).id;
          await api(`${base}/messages`, b, 'POST', liveInput);
          await waitFor(`document.querySelector('[aria-label="Messages"]').innerText.includes('Automatic incoming message')`);
          assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="group"]')).filter(element=>element.textContent.includes('Automatic incoming message')).length`), 1);
          await waitFor(`fetch(${JSON.stringify(`${origin}${base}/messages`)}).then(response=>response.json()).then(page=>page.messages.find(row=>row.id===${JSON.stringify(liveId)})?.status==='read')`);
          diagnostic('incoming delivery, deduplication and read receipt synchronized');
          await api(`${base}/messages/${liveId}`, b, 'PATCH', { content: 'Automatic edited message' });
          await waitFor(`document.querySelector('[aria-label="Messages"]').innerText.includes('Automatic edited message')`);
          await command('Network.setBlockedURLs', { urls: [`${origin}/api/realtime/sync*`] });
          await evaluate(`window.dispatchEvent(new Event('online'))`);
          await waitFor(`document.body.innerText.includes('Reconnecting…')`);
          await api(`${base}/messages/${liveId}`, b, 'PATCH', { content: 'Recovered realtime message' });
          await command('Network.setBlockedURLs', { urls: [] });
          await evaluate(`window.dispatchEvent(new Event('online'))`);
          await waitFor(`document.querySelector('[aria-label="Messages"]').innerText.includes('Recovered realtime message')`);
          assert.equal(await evaluate('window.__chatbitRealtimeMarker'), true);
          await api(`${base}/messages/${liveId}`, b, 'DELETE');
          await waitFor(`!document.querySelector('[aria-label="Messages"]').innerText.includes('Recovered realtime message')`);
          await api('/api/realtime/activity', b, 'POST', { tabId: partnerTab, sequence: 2, conversationId: id, typing: false, leaving: true });
          await waitFor(`document.querySelector('header').innerText.includes('Offline') || document.querySelector('header').innerText.includes('Last seen')`);
          const newConversation = (await (await api('/api/conversations', c, 'POST', { participantId: me })).json()).id;
          await api(`/api/conversations/${newConversation}/messages`, c, 'POST', { content: 'Another conversation update', clientId: randomUUID() });
          await waitFor(`document.querySelector('[aria-label="Conversations"]').innerText.includes('Another conversation update')`);
          assert.ok(await evaluate(`document.querySelector('a[href="/chat/${newConversation}"] [aria-label="1 unread messages"]') !== null`));
          assert.ok(await evaluate(`!document.querySelector('[aria-label="Messages"]').innerText.includes('Another conversation update')`));
          diagnostic('reconnection, live deletion, new conversation and unread preview verified');
          await fill('textarea[aria-label="Message"]', 'Browser persistence message');
          await waitFor(`!document.querySelector('button[aria-label="Send message"]').disabled`);
          await evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
          await waitFor(`Array.from(document.querySelectorAll('[data-message-delivery=sent],[data-message-delivery=read]')).some(row=>row.textContent.includes('Browser persistence message')) && document.querySelector('textarea[aria-label="Message"]').value === '' && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('message sent');
          await evaluate('window.__chatbitReloadMarker=true');
          await command('Page.reload');
          await waitFor(`!window.__chatbitReloadMarker && document.body.innerText.includes('Browser persistence message') && document.querySelector('textarea[aria-label="Message"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')).some(key=>key.startsWith('__reactFiber$')) && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('refresh persistence verified');
          await evaluate(`Array.from(document.querySelectorAll('[role="group"]')).find(element=>element.textContent.includes('Browser persistence message')).querySelector('button[title="Edit"]').click()`);
          await waitFor(`document.querySelector('textarea[aria-label="Message"]').value === 'Browser persistence message'`);
          await fill('textarea[aria-label="Message"]', 'Browser edited message');
          await evaluate(`document.querySelector('button[aria-label="Save message"]').click()`);
          await waitFor(`document.body.innerText.includes('Browser edited message') && document.querySelector('textarea[aria-label="Message"]').value === ''`);
          diagnostic('message edited');
          await command('Network.setBlockedURLs', { urls: [`${origin}/api/conversations/${id}/messages`] });
          await fill('textarea[aria-label="Message"]', 'Draft kept after failure');
          await evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
          await waitFor(`document.querySelector('[role="alert"]') && document.querySelector('textarea[aria-label="Message"]').value === 'Draft kept after failure' && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('failed draft retained');
          await command('Network.setBlockedURLs', { urls: [] });
          await evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
          await waitFor(`Array.from(document.querySelectorAll('[data-message-delivery=sent],[data-message-delivery=read]')).some(row=>row.textContent.includes('Draft kept after failure')) && document.querySelector('textarea[aria-label="Message"]').value === '' && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('draft retried');
          await evaluate(`document.querySelector('[aria-label="Messages"]').scrollTop=0; Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Load older messages')).click()`);
          await waitFor(`document.body.innerText.includes('Browser older message 0') && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          diagnostic('older messages loaded');
          assert.ok(await evaluate(`(() => { const area=document.querySelector('[aria-label="Messages"]'); return area.scrollTop < area.scrollHeight - area.clientHeight - 100; })()`));
          await evaluate(`Array.from(document.querySelectorAll('[role="group"]')).find(element=>element.textContent.includes('Browser edited message')).querySelector('button[title="Delete"]').click()`);
          await waitFor(`!document.body.innerText.includes('Browser edited message') && !document.querySelector('textarea[aria-label="Message"]').disabled`);
          await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile conversation must not overflow horizontally');
          await evaluate(`Array.from(document.querySelectorAll('[role="group"]')).find(element=>element.querySelector('button[title="Edit"]')).querySelector('button[aria-label="Message actions"]').click()`);
          await waitFor(`document.querySelector('button[aria-label="Message actions"][aria-expanded="true"]')`);
          assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="group"]')).some(element => element.querySelector('button[aria-label="Message actions"][aria-expanded="true"]') && Array.from(element.querySelectorAll('button')).some(button => button.textContent.trim() === 'Edit'))`), 'Mobile menu must expose author actions');
          await evaluate(`document.querySelector('button[aria-label="Message actions"][aria-expanded="true"]').click()`);
          const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(new URL('../.next/auth-http-test/mobile-messaging.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
          await evaluate(`document.querySelector('a[aria-label="Back to conversations"]').click()`);
          await waitFor(`location.pathname === '/chat' && document.body.innerText.includes('Messaging Partner')`);
          assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile conversation list must fit');
        });
      });
      await messageTest.test('attachment picker errors and full-screen history work with synthetic metadata', {
        skip: !process.env.CHROME_BIN && 'Requires Chrome; no live object storage is used',
      }, async () => {
        // Seed metadata only. Unavailable storage deliberately exercises preview errors;
        // byte validation and durable uploads are covered by the storage suites.
        const file = await reserveAttachment(pool, me, id, { filename: 'viewer-fixture.png', mimeType: 'image/png', byteSize: 1 });
        await finalizeAttachment(pool, me, id, file.id, { clientId: randomUUID(), caption: 'Viewer metadata fixture' });
        await withBrowser(async ({ command, evaluate, waitFor }) => {
          await command('Network.setCookie', { name: 'chatbit_session', value: a.token, url: origin, httpOnly: true, sameSite: 'Lax' });
          await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
          await command('Page.navigate', { url: `${origin}/chat/${id}` });
          await waitFor(`document.querySelector('textarea') && Object.keys(document.querySelector('textarea')).some(key=>key.startsWith('__reactFiber$'))`);
          await waitFor(`document.body.innerText.includes('Preview unavailable. Retry or download the file.')`);
          const historyLength = await evaluate('history.length');
          const open = async () => {
            await evaluate(`document.querySelector('button[aria-label="View viewer-fixture.png full screen"]').click()`);
            await waitFor(`document.querySelector('dialog[open][aria-label="viewer-fixture.png"]') && history.state?.chatbitViewer`);
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Full-screen viewer fits a small phone');
          };
          await open();
          assert.equal(await evaluate('history.length'), historyLength + 1, 'Strict Mode creates exactly one viewer history entry');
          await evaluate(`document.querySelector('button[aria-label="Close media viewer"]').click()`);
          await waitFor(`!document.querySelector('dialog[open]') && !history.state?.chatbitViewer`);
          await open();
          await evaluate('history.back()');
          await waitFor(`!document.querySelector('dialog[open]') && document.querySelector('textarea')`);
          assert.equal(await evaluate('location.pathname'), `/chat/${id}`, 'Web Back closes the viewer without leaving the conversation');
          await evaluate(`document.querySelector('button[aria-label="Add attachment"]').click()`);
          await waitFor(`document.querySelector('[aria-label="Attachment sources"]')`);
          await evaluate(`document.querySelector('[aria-label="Attachment sources"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
          await waitFor(`!document.querySelector('[aria-label="Attachment sources"]')`);
          await evaluate(`(()=>{const input=document.querySelector('input[type=file]'),files=new DataTransfer();for(const [name,type] of [['phone.png','image/png'],['clip.mp4','video/mp4'],['document.pdf','application/pdf']])files.items.add(new File(['fixture'],name,{type}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await waitFor(`document.querySelector('button[aria-label="Remove document.pdf"]')`);
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Queued photo/video/document controls fit a small phone');
          for (const name of ['phone.png', 'clip.mp4', 'document.pdf']) await evaluate(`document.querySelector('button[aria-label="Remove ${name}"]').click()`);
          await waitFor(`!document.querySelector('button[aria-label^="Remove "]')`);
          await evaluate(`(()=>{const input=document.querySelector('input[type=file]'),files=new DataTransfer();files.items.add(new File(['fixture'],'blocked.exe'));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await waitFor(`Array.from(document.querySelectorAll('[role="alert"]')).some(alert=>alert.textContent.includes('Unsupported file type'))`);
        });
      });
    });
    await t.test('two real browsers register, log in, discover contacts, exchange/edit/reply/read/delete and log out', {
      skip: !process.env.CHROME_BIN && 'Set CHROME_BIN for the two-user browser journey',
    },()=>browserJourney(origin));
  } finally {
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
      await Promise.race([stopped,delay(3000)]);
      if(child.exitCode===null && child.signalCode===null) {process.kill(-child.pid,'SIGKILL');await stopped;}
    }
    await pool?.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  }
});
