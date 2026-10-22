import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {pushConfig,pushChannel,pushToken,publishHints} from '../lib/server/push-core.mjs';
import {createPushRefresh} from '../lib/push-refresh.mjs';
import {createPushSubscription} from '../lib/push-subscription.mjs';

const config={key:'fixture.key:synthetic-secret-for-isolated-test'};
test('push is opt-in, token capabilities are subscribe-only and scoped to one opaque account',async()=>{
  assert.equal(pushConfig({}),null);
  assert.throws(()=>pushConfig({CHATBIT_REALTIME_PROVIDER:'ably',ABLY_API_KEY:'invalid'}));
  const value=await pushToken(config,'user-a','local-secret');
  assert.notEqual(value.channel,pushChannel('user-b','local-secret'));
  assert.deepEqual(JSON.parse(value.tokenRequest.capability),{[value.channel]:['subscribe']});
  assert.equal(value.tokenRequest.ttl,60000);
  const t=value.tokenRequest;
  const signingText=[t.keyName,t.ttl,t.capability,t.clientId,t.timestamp,t.nonce,''].join('\n');
  assert.equal(t.mac,createHmac('sha256',config.key.split(':')[1]).update(signingText).digest('base64'));
  assert.ok(!JSON.stringify(value).includes(config.key));
});
test('publish targets only deduplicated recipients and includes no private payload',async()=>{
  const sent=[];
  await publishHints(config,['a','b','a'],'secret',async(...args)=>sent.push(args));
  assert.deepEqual(sent, ['a','b'].map(user=>[pushChannel(user,'secret'),'invalidate',{v:1}]));
  await assert.rejects(publishHints(config,['a'],'secret',async()=>{throw new Error('offline');}));
});
test('event bursts coalesce to one trailing resync without starving an active snapshot',async()=>{
  const pending=[];let active=0,max=0;
  const controller=createPushRefresh(()=>new Promise(resolve=>{active++;max=Math.max(max,active);pending.push(()=>{active--;resolve();});}));
  controller.wake();for(let i=0;i<100;i++)controller.wake();assert.equal(pending.length,1);
  pending.shift()();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pending.length,1);assert.equal(max,1);
  controller.stop();pending.shift()();await new Promise(resolve=>setTimeout(resolve,0));controller.wake();assert.equal(pending.length,0);
});
test('disabled transport never loads SDK; disposal fences a late bootstrap',async()=>{
  let loads=0,resolve;const healthy={current:false};
  const options={loadClient:async()=>{loads++;throw new Error('Should not load');},refresh:async()=>{},healthy};
  const stop=createPushSubscription({...options,token:async()=>({enabled:false})});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(loads,0);stop();
  const cancel=createPushSubscription({...options,token:()=>new Promise(r=>resolve=r)});
  cancel();resolve({enabled:true});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(loads,0);
});
