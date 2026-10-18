import assert from 'node:assert/strict';
import { test } from 'node:test';
import { longPress } from '../lib/touch-actions.mjs';

test('message long press opens only a stationary primary touch and cancels scrolling/unmount', () => {
  let task; let opened = 0;
  const press = longPress(() => opened++, { schedule: fn => { task = fn; return 1; }, cancel: () => { task = undefined; } });
  const touch = { isPrimary: true, pointerType: 'touch', clientX: 10, clientY: 20 };
  press.start({ ...touch, pointerType: 'mouse' }); assert.equal(task, undefined);
  press.start({ ...touch, isPrimary: false }); assert.equal(task, undefined);
  press.start(touch); press.move({ clientX: 11, clientY: 22 }); task(); assert.equal(opened, 1);
  press.start(touch); press.move({ clientX: 10, clientY: 40 }); assert.equal(task, undefined);
  press.start(touch); press.stop(); assert.equal(task, undefined); assert.equal(opened, 1);
});
