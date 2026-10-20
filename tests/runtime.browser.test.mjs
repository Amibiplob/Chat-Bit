import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBrowser } from './helpers/browser.mjs';

// TEST_RUNTIME_DATABASE_FAILURE=1 selects an intentionally broken test server.
// Otherwise a synthetic token must resolve to a missing session in a working DB.
test('public rendering, first-paint themes and client recovery have no script or hydration warnings', {
  skip: !process.env.TEST_RUNTIME_ORIGIN && 'Set TEST_RUNTIME_ORIGIN for runtime Chrome regressions',
  timeout: 180000,
}, async () => {
  const origin = new URL(process.env.TEST_RUNTIME_ORIGIN);
  assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname));
  await withBrowser(async ({ command, evaluate, waitFor }) => {
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__runtimeIssues=[];window.__themeAtPaint=[];
      for(const name of ['error','warn']){const original=console[name];console[name]=(...args)=>{
        const text=args.filter(value=>typeof value==='string').join(' ');
        if(/Encountered a script tag|hydration|hydrated but|didn't match/i.test(text))window.__runtimeIssues.push('render-warning');
        original(...args);
      }}
      new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.name==='first-contentful-paint')window.__themeAtPaint.push(document.documentElement.classList.contains('dark'));}).observe({type:'paint',buffered:true});
    ` });
    const navigate = async path => {
      await command('Page.navigate', { url: new URL(path, origin).href });
      await waitFor(`document.readyState==='complete'`);
    };
    for (const cookie of [null, 'invalid']) {
      if (cookie) await command('Network.setCookie', { name: process.env.TEST_RUNTIME_PRODUCTION === '1' ? '__Host-chatbit_session' : 'chatbit_session', value: cookie, url: origin.href, secure: process.env.TEST_RUNTIME_PRODUCTION === '1', httpOnly: true });
      for (const path of ['/', '/signup', '/login']) {
        await navigate(path);
        await waitFor(`document.querySelector('header') && document.querySelector('a[href="/login"]')`);
        assert.deepEqual(await evaluate('window.__runtimeIssues'), [], `${path}: no rendering warnings`);
      }
    }
    await command('Network.clearBrowserCookies');
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    for (const [theme, dark] of [['dark', true], ['light', false], ['system', true]]) {
      await evaluate(`localStorage.setItem('chatbit-theme',${JSON.stringify(theme)});dispatchEvent(new Event('chatbit-theme'));`);
      await waitFor(`document.documentElement.classList.contains('dark')===${dark}`);
      await navigate('/');
      await waitFor(`window.__themeAtPaint.length>0`);
      assert.deepEqual(await evaluate('window.__themeAtPaint'), [dark], `${theme}: correct theme at first contentful paint`);
      assert.ok(await evaluate(`(() => {
        const paint=performance.getEntriesByName('first-contentful-paint')[0];
        const script=performance.getEntriesByType('resource').find(entry=>entry.name.endsWith('/theme-bootstrap.js'));
        return script && paint && paint.startTime>=script.responseEnd;
      })()`), 'Bootstrap finishes loading before first contentful paint');
      assert.deepEqual(await evaluate('window.__runtimeIssues'), []);
    }
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await waitFor(`!document.documentElement.classList.contains('dark')`);
    // A syntactically valid cookie forces the real server authentication path:
    // unknown sessions are signed out; database outages must remain errors.
    const cookieName = process.env.TEST_RUNTIME_PRODUCTION === '1' ? '__Host-chatbit_session' : 'chatbit_session';
    await command('Network.setCookie', { name: cookieName, value: 'x'.repeat(43), url: origin.href, secure: process.env.TEST_RUNTIME_PRODUCTION === '1', httpOnly: true });
    if (process.env.TEST_RUNTIME_DATABASE_FAILURE !== '1') {
      assert.equal(await evaluate(`fetch('/').then(response=>response.status)`), 200, 'Missing sessions remain signed out');
      await navigate('/');
      await waitFor(`document.querySelector('header') && document.querySelector('a[href="/login"]')`);
      assert.deepEqual(await evaluate('window.__runtimeIssues'), []);
      return;
    }
    assert.equal(await evaluate(`fetch('/').then(response=>response.status)`), 500, 'Database failures remain server errors');
    await evaluate(`localStorage.setItem('chatbit-theme','dark')`);
    await navigate('/');
    await waitFor(`!document.querySelector('header')`);
    await waitFor(`document.documentElement.classList.contains('dark')`);
    // Allow the client recovery and development overlay to finish reporting.
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.deepEqual(await evaluate('window.__runtimeIssues'), [], 'Client recovery emits no script/hydration warnings');
    assert.equal(await evaluate(`!!document.querySelector('a[href="/chat"]')`), false);
  });
});
