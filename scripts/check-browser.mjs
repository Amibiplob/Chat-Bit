import assert from 'node:assert/strict';
import { withBrowser } from '../tests/helpers/browser.mjs';

const origin = new URL(process.env.CHATBIT_BROWSER_ORIGIN ?? 'http://127.0.0.1:3187');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Use an isolated local app, never production');
await withBrowser(async ({ command, evaluate, waitFor }) => {
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.browserFailures=[];addEventListener('error',e=>browserFailures.push(e.message));addEventListener('unhandledrejection',e=>browserFailures.push(String(e.reason)));const originalError=console.error;console.error=(...args)=>{browserFailures.push(args.map(String).join(' '));originalError(...args);};addEventListener('beforeinstallprompt',event=>{if(event.isTrusted){event.preventDefault();event.stopImmediatePropagation();}},true);` });
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
  await command('Page.navigate', { url: origin.href });
  await waitFor(`document.querySelector('[data-install-ready="true"]') && navigator.serviceWorker.controller`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Install ChatBit')`), false, 'Unsupported browsers receive instructions, not an inert install button');
  await evaluate(`(()=>{window.installPrompts=0;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{installPrompts++;};event.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(event);})()`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Install ChatBit')`);
  assert.equal(await evaluate('window.installPrompts'), 0);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Install ChatBit').click()`);
  await waitFor(`Array.from(document.querySelectorAll('[role="status"]')).some(element=>element.textContent.includes('install later'))`);
  assert.equal(await evaluate('window.installPrompts'), 1);
  await evaluate(`(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{installPrompts++;};event.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(event);})()`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Install ChatBit')`), false, 'Dismissal suppresses another native prompt');
  await evaluate(`dispatchEvent(new Event('appinstalled'))`);
  await waitFor(`document.body.textContent.includes('ChatBit is installed.')`);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  for (const [theme, dark] of [['light', false], ['dark', true], ['system', true]]) {
    await evaluate(`localStorage.setItem('chatbit-theme',${JSON.stringify(theme)});dispatchEvent(new Event('chatbit-theme'))`);
    await waitFor(`document.documentElement.classList.contains('dark')===${dark}`);
  }
  const caches = await evaluate(`(async()=>{const result=[];for(const name of await window.caches.keys()){const cache=await window.caches.open(name);for(const request of await cache.keys())result.push(new URL(request.url).pathname);}return result;})()`);
  assert.deepEqual(caches, ['/offline.html']);
  // Workers have separate CDP sessions; emulating only the page's network can
  // leave the worker's own network-first fetch online.
  const targets = await command('Target.getTargets');
  const worker = targets.targetInfos.find(target => target.type === 'service_worker' && target.url === new URL('/sw.js', origin).href);
  assert.ok(worker, 'Registered service worker target must exist');
  const { sessionId } = await command('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  await command('Network.enable', {}, sessionId);
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await command('Page.navigate', { url: new URL('/chat', origin).href });
  await waitFor(`document.querySelector('h1')?.textContent==='You’re offline.'`);
  assert.equal(await evaluate('document.querySelectorAll("script[src],link[rel=stylesheet]").length'), 0, 'Offline document has no network asset dependency');
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
  await command('Target.detachFromTarget', { sessionId });
  console.log('PASS: 35 public route/viewport checks, errors/hydration, signup validation, theme changes, simulated install lifecycle, cache isolation and offline navigation. No real-device/native-install/production proof.');
});
