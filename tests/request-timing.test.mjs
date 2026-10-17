import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timedOperation, recordDatabaseTiming } from '../lib/server/request-timing.mjs';
test('request timing isolates concurrent metrics and emits only numeric durations',async()=>{
 const [a,b]=await Promise.all([timedOperation(async()=>{recordDatabaseTiming(2,7);await new Promise(r=>setTimeout(r,10));return 'a';}),timedOperation(async()=>{recordDatabaseTiming(3,11);return 'b';})]);
 assert.match(a.serverTiming,/pool;dur=2.0, db;dur=7.0/);assert.match(b.serverTiming,/pool;dur=3.0, db;dur=11.0/);
 assert.equal(a.value,'a');assert.ok(!a.serverTiming.includes('a;'));
});
