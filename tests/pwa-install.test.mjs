import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installController, INSTALL_DISMISSED_KEY } from '../lib/pwa-install.mjs';

function fixture(stored = null) {
  const target = new EventTarget(), media = new EventTarget(); media.matches = false;
  const values = new Map(stored ? [[INSTALL_DISMISSED_KEY, stored]] : []);
  let state;
  const controller = installController({ target, media, storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }, now: () => 1000000000, changed: next => { state = next; } });
  return { target, media, values, controller, state: () => state };
}
test('install events are captured without prompting, consumed once and hide when installed', async () => {
  const f = fixture(); let prompts = 0;
  assert.equal(await f.controller.prompt(), 'manual');
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = async () => { prompts++; }; event.userChoice = Promise.resolve({ outcome: 'accepted' });
  f.target.dispatchEvent(event); assert.ok(event.defaultPrevented); assert.equal(prompts, 0);
  assert.equal(f.state().available, true);
  assert.equal(await f.controller.prompt(), 'accepted');
  assert.equal(await f.controller.prompt(), 'manual'); assert.equal(prompts, 1);
  f.target.dispatchEvent(new Event('appinstalled')); assert.equal(f.state().installed, true);
  f.controller.dispose();
});
test('dismissal suppresses repeated prompts across visits; unsupported/blocked storage stays usable', async () => {
  const f = fixture();
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = async () => {}; event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  f.target.dispatchEvent(event); assert.equal(await f.controller.prompt(), 'dismissed');
  const next = fixture(f.values.get(INSTALL_DISMISSED_KEY)); next.target.dispatchEvent(event);
  assert.equal(next.state().available, false); assert.equal(await next.controller.prompt(), 'manual');
  f.controller.dispose(); next.controller.dispose();
  let state;
  const target = new EventTarget(), media = new EventTarget(); media.matches = true;
  const c = installController({ target, media, storage: { getItem() { throw new Error('blocked'); } }, changed: value => { state = value; } });
  assert.equal(state.installed, true); assert.equal(await c.prompt(), 'manual'); c.dispose();
});
test('invalid install events never expose a button and rejected prompts return a recoverable outcome', async () => {
  const f = fixture();
  f.target.dispatchEvent(new Event('beforeinstallprompt'));
  assert.equal(f.state().available, false);
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = async () => { throw new Error('User gesture required'); };
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  f.target.dispatchEvent(event);
  assert.equal(await f.controller.prompt(), 'error');
  assert.equal(f.state().available, false);
  assert.equal(f.state().busy, false);
  f.controller.dispose();
  f.target.dispatchEvent(event);
  assert.equal(f.state().available, false);
});
