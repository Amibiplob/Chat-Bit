import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationCache } from '../lib/conversation-cache.mjs';
const fixture=id=>({conversation:{id},currentUserId:'account',initialPage:{messages:[{id:'m',conversationId:id}],nextCursor:null}});
test('conversation cache is instance-scoped, identity checked, expires and evicts',()=>{
  let now=0;const a=createConversationCache({limit:2,ttl:60,clock:()=>now}),b=createConversationCache();
  a.put(fixture('a'));a.put(fixture('b'));assert.equal(b.get('a'),null);
  a.put(fixture('c'));assert.equal(a.get('a'),null);assert.equal(a.size(),2);
  now=61;assert.equal(a.get('b'),null);a.touch('c');assert.ok(a.get('c'));
  assert.throws(()=>a.put({...fixture('c'),initialPage:{messages:[{conversationId:'wrong'}]}}));
  a.clear();assert.equal(a.get('c'),null);
  a.put(fixture('c'));a.remove('c');assert.equal(a.unavailable('c'),true);assert.equal(a.get('c'),null);
  a.put(fixture('c'));assert.equal(a.unavailable('c'),true,'Local view state cannot undo an authorization rejection');
  a.put(fixture('c'),true);assert.equal(a.unavailable('c'),false);
  now+=61;assert.equal(a.get('c'),null);
  a.refreshPage('c',{messages:[{id:'fresh',conversationId:'c'}],nextCursor:null});assert.equal(a.get('c').initialPage.messages[0].id,'fresh');
  assert.throws(()=>createConversationCache({limit:9}));assert.throws(()=>createConversationCache({ttl:60001}));
});
test('cache bounds retained history and keeps a valid pagination boundary',()=>{
  const a=createConversationCache();const entry=fixture('a');entry.initialPage.messages=Array.from({length:150},(_,i)=>({id:String(i),createdAt:String(i),conversationId:'a'}));
  a.put(entry);assert.equal(a.get('a').initialPage.messages.length,100);assert.deepEqual(a.get('a').initialPage.nextCursor,{id:'50',createdAt:'50'});
});
test('local rendering cannot extend the last authorized cache lifetime',()=>{
  let now=0;const a=createConversationCache({ttl:60,clock:()=>now});a.put(fixture('a'),true);
  now=59;a.put(fixture('a'));now=61;assert.equal(a.get('a'),null);
  a.put(fixture('a'),true);assert.ok(a.get('a'));
});
