import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createOutgoingMessages, mergeOutgoingMessages } from '../lib/outgoing-messages.mjs';
const message=(conversationId='a')=>({id:randomUUID(),clientId:randomUUID(),conversationId,senderId:'user',content:'fixture',delivery:'sending',createdAt:new Date().toISOString()});
const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await delay(5);assert.ok(predicate());};
test('local acceptance is immediate, serializes each thread and confirms canonical identities',async t=>{
  const requests=[];const store=createOutgoingMessages({request:(row,signal)=>new Promise(resolve=>requests.push({row,signal,resolve}))});t.after(()=>store.stop());
  const a=message(),b=message(),c=message('b');assert.ok(store.enqueue(a));assert.ok(store.enqueue(b));assert.ok(store.enqueue(c));
  assert.equal(store.read('a').length,2);assert.equal(requests.length,2);
  requests[0].resolve({...a,id:'server',delivery:undefined});await until(()=>requests.length===3);
  assert.equal(store.read('a')[0].id,'server');store.reconcile('a',[{...a,id:'server'}]);assert.equal(store.read('a').length,1);
  assert.equal(store.enqueue(b),false);
});
test('lost acknowledgement retries with same key; a snapshot fences a later failure',async t=>{
  const a=message();let attempts=0,failures=0;
  const store=createOutgoingMessages({retryDelay:1,request:async row=>{attempts++;assert.equal(row.clientId,a.clientId);if(attempts===1)throw new TypeError('network');return {...row,id:'server',delivery:undefined};}});t.after(()=>store.stop());
  store.enqueue(a);await until(()=>store.read('a')[0]?.id==='server');assert.equal(attempts,2);
  const blocked=[];const other=createOutgoingMessages({request:()=>new Promise((resolve,reject)=>blocked.push({resolve,reject})),onFailure:()=>failures++});t.after(()=>other.stop());
  other.enqueue(a);other.reconcile('a',[{...a,id:'server'}]);blocked[0].reject({status:400});await delay(10);assert.equal(other.read('a').length,0);assert.equal(failures,0);
});
test('failure remains retryable after navigation, duplicate retries are rejected and teardown aborts',async()=>{
  let attempts=0,failed=0,signal;const a=message();
  const store=createOutgoingMessages({request:async(row,s)=>{signal=s;attempts++;if(attempts===1)throw {status:400};return {...row,id:'saved',delivery:undefined};},onFailure:()=>failed++});
  store.enqueue(a);await until(()=>store.read('a')[0].delivery==='failed');assert.equal(failed,1);
  assert.equal(store.retry('a',a.clientId),true);assert.equal(store.retry('a',a.clientId),false);await until(()=>store.read('a')[0].id==='saved');
  assert.equal(store.retry('a',a.clientId),false);store.stop();assert.equal(store.read('a').length,0);assert.equal(store.enqueue(message()),false);assert.ok(signal);
});
test('session rejection clears the outbox and stops queued sends',async()=>{
  let reject,requests=0,unauthorized=0;
  const store=createOutgoingMessages({request:()=>{requests++;return new Promise((resolve,r)=>reject=r);},onUnauthorized:()=>unauthorized++});
  store.enqueue(message());store.enqueue(message());reject({status:401});
  await until(()=>unauthorized===1);assert.equal(requests,1);assert.equal(store.read('a').length,0);assert.equal(store.enqueue(message()),false);
});
test('canonical acknowledgements retain server order and other senders cannot reconcile a submission',()=>{
  const a={...message(),createdAt:'2026-01-01T00:00:01.000000Z',delivery:undefined};
  const b={...message(),createdAt:'2026-01-01T00:00:02.000000Z',delivery:undefined};
  const pending={...message(),createdAt:'2000-01-01T00:00:00.000Z'};
  assert.deepEqual(mergeOutgoingMessages([b],[a,pending]).map(row=>row.id),[a.id,b.id,pending.id]);
  const copy={...a,id:randomUUID(),senderId:'other'};
  assert.equal(mergeOutgoingMessages([copy],[a]).length,2);
  assert.equal(mergeOutgoingMessages([a],[{...a,id:'temporary'}]).length,1);
});
