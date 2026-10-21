import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationViewStore } from '../lib/conversation-view-store.mjs';
test('drafts and scroll are isolated, bounded and private to each provider store',()=>{
  const a=createConversationViewStore(2),b=createConversationViewStore();
  a.setDraft('one','First draft');a.setDraft('two','Second draft');a.setScroll('one',{top:200,pinned:false});
  assert.equal(a.read('one').draft,'First draft');assert.equal(b.read('one').draft,'');
  a.setDraft('three','third');assert.equal(a.size(),2);assert.equal(a.read('two').draft,'');
  assert.deepEqual(a.read('one').scroll,{top:200,pinned:false});
  a.setDraft('one','x'.repeat(12000));assert.equal(a.read('one').draft.length,10000);
  a.setScroll('one',{top:NaN,pinned:false});assert.equal(a.read('one').scroll.top,200);
  assert.throws(()=>createConversationViewStore(21));
});
test('pending sends prevent duplicate mutations across views and retain retry IDs after failures',()=>{
  const store=createConversationViewStore(2);let updates=0;const unsubscribe=store.subscribe(()=>updates++);
  store.setDraft('one','Keep until confirmed');assert.equal(store.beginSend('one'),true);assert.equal(store.beginSend('one'),false);
  const key=store.retry('one','fingerprint');store.endSend('one');
  assert.equal(store.retry('one','fingerprint'),key);assert.equal(store.read('one').draft,'Keep until confirmed');
  store.beginSend('one');store.setDraft('two','other');store.setDraft('three','third');assert.equal(store.retry('one','fingerprint'),key);
  store.confirm('one','Keep until confirmed');assert.equal(store.read('one').draft,'');assert.equal(store.read('one').retry,null);
  store.endSend('one');assert.ok(updates>=4);const before=updates;unsubscribe();store.setDraft('one','after unsubscribe');assert.equal(updates,before);
});
test('late acknowledgement never removes a different newer draft',()=>{
  const store=createConversationViewStore();store.setDraft('one','new draft');store.confirm('one','old draft');assert.equal(store.read('one').draft,'new draft');
});
