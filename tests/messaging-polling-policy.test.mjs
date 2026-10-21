import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMessagingPollingPolicy} from '../lib/messaging-polling-policy.mjs';
test('fast polling expires without interaction and background/list views use lower request rates',()=>{
  let now=0;const policy=createMessagingPollingPolicy(()=>now);
  assert.equal(policy.interval('chat',true),1000);now=15000;assert.equal(policy.interval('chat',true),2500);
  assert.equal(policy.interval(null,true),5000);assert.equal(policy.interval('chat',false),15000);
  policy.activate();assert.equal(policy.interval('chat',true),1000);now+=15001;assert.equal(policy.interval('chat',true),2500);
});
