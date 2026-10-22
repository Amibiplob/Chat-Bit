import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchSessionExpiry} from '../lib/session-expiry.mjs';

function fixture(deadline, initial) {
  let now=initial, callback, delay, expired=0, next=0;
  const timers=new Set();
  const watcher=watchSessionExpiry(deadline,()=>expired++,{
    now:()=>now,
    setTimer:(fn,ms)=>{callback=fn;delay=ms;timers.add(++next);return next;},
    clearTimer:id=>timers.delete(id),
  });
  return {watcher, timers, advance:value=>{now=value;}, fire:()=>callback(), get delay(){return delay;}, get expired(){return expired;}};
}

test('fractional session deadlines and early timer callbacks cannot strand a private workspace',()=>{
  const f=fixture(1000.5,1000);
  assert.equal(f.delay,1);
  f.fire(); // A callback before the deadline must arrange another check.
  assert.equal(f.expired,0);assert.equal(f.timers.size,1);
  f.advance(1001);f.fire();
  assert.equal(f.expired,1);assert.equal(f.timers.size,0);
  f.watcher.check();assert.equal(f.expired,1);
});

test('clock changes, foreground checks and cleanup retain one bounded expiry timer',()=>{
  const f=fixture(2000,1000);
  f.advance(500);f.fire();assert.equal(f.delay,1500);
  f.watcher.check();assert.equal(f.timers.size,1);
  f.advance(2001);f.watcher.check();assert.equal(f.expired,1);assert.equal(f.timers.size,0);
  const stopped=fixture(2000,1000);stopped.watcher.stop();stopped.advance(3000);stopped.fire();
  assert.equal(stopped.expired,0);assert.equal(stopped.timers.size,0);
  const distant=fixture(3e12,1000);assert.equal(distant.delay,2147483647);distant.watcher.stop();
});

test('an already expired server deadline rejects immediately without waiting for a timer',()=>{
  const f=fixture(1000,1000);assert.equal(f.expired,1);assert.equal(f.timers.size,0);
});
