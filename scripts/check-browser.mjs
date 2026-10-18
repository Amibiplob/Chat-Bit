import assert from 'node:assert/strict';
import { withBrowser } from '../tests/helpers/browser.mjs';

const origin = new URL(process.env.CHATBIT_BROWSER_ORIGIN ?? 'http://127.0.0.1:3187');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Use an isolated local app, never production');
await withBrowser(async ({ command, evaluate, waitFor }) => {
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.browserFailures=[];addEventListener('error',e=>browserFailures.push(e.message));addEventListener('unhandledrejection',e=>browserFailures.push(String(e.reason)));const originalError=console.error;console.error=(...args)=>{browserFailures.push(args.map(String).join(' '));originalError(...args);};` });
  for (const width of [320, 390, 430, 768, 1280]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
    for (const path of ['/', '/login', '/signup', '/help', '/about', '/offline', '/does-not-exist']) {
      await command('Page.navigate', { url: new URL(path, origin).href });
      await waitFor(`document.readyState==='complete' && document.querySelector('h1')`);
      await evaluate('document.fonts.ready.then(()=>true)');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), `${path} overflows at ${width}px`);
      assert.deepEqual(await evaluate('window.browserFailures'), [], `${path} errors at ${width}px`);
    }
  }
  await command('Page.navigate', { url: new URL('/signup', origin).href });
  await waitFor(`document.querySelector('form') && Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactFiber$'))`);
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await waitFor(`document.querySelector('input[aria-invalid="true"]')`);
  assert.equal(await evaluate('document.activeElement.id'), 'name');
  await evaluate(`localStorage.setItem('chatbit-theme','dark')`);
  // Theme is also checked through its live controls in database-backed journeys.
  console.log('PASS: 35 public route/viewport checks, browser errors/hydration and signup validation. No authenticated/device/production proof.');
});
