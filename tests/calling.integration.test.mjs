import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { sessionHash } from '../lib/server/session-core.mjs';
import { createConversation } from '../lib/server/messaging-queries.mjs';
import * as calls from '../lib/server/calling-queries.mjs';

test('calling transitions, busy races, scoped signaling and cleanup in isolated PostgreSQL',{
  skip:!process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test instance',
},async(t)=> {
  const config=databaseConfig({DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:process.env.TEST_DATABASE_SSL??'verify'});
  const schema=`chatbit_calls_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool(config);let pool,created=false;
  const [a,b,c]=[randomUUID(),randomUUID(),randomUUID()].sort();
  const sa=sessionHash(randomBytes(32).toString('base64url')),sb=sessionHash(randomBytes(32).toString('base64url')),sc=sessionHash(randomBytes(32).toString('base64url'));
  const ta=randomUUID(),tb=randomUUID(),tc=randomUUID();let conversation,other,current;
  const start=(conversationId=conversation,clientId=randomUUID())=>({conversationId,clientId,tabId:ta,kind:'voice'});
  const act=(id,user,session,tabId,action)=>calls.actionCall(pool,user,session,id,{tabId,action});
  const signal=(id,user,session,tabId,kind,payload,clientId=randomUUID())=>calls.signalCall(pool,user,session,id,{tabId,clientId,signal:{kind,payload}});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);created=true;
    pool=new pg.Pool({...config,options:`-c search_path=${schema}`});await migrate(pool);
    for(const [i,id] of [a,b,c].entries()) await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`call${i}@example.com`,`Caller ${i}`,'$argon2id$fixture']);
    for(const [id,session] of [[a,sa],[b,sb],[c,sc]]) await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[session,id]);
    conversation=await createConversation(pool,a,{participantId:b});other=await createConversation(pool,a,{participantId:c});
    await t.test('creation checks membership and idempotency; opposite-direction races have one winner',async()=> {
      await assert.rejects(calls.createCall(pool,c,sc,start()),{status:404});
      const input=start();const results=await Promise.allSettled([calls.createCall(pool,a,sa,input),calls.createCall(pool,b,sb,{...start(),tabId:tb})]);
      assert.equal(results.filter((r)=>r.status==='fulfilled').length,1);
      const winner=results.find((r)=>r.status==='fulfilled').value;
      if(winner.callerId===a) {assert.equal((await calls.createCall(pool,a,sa,input)).id,winner.id);await act(winner.id,a,sa,ta,'cancel');}
      else await act(winner.id,b,sb,tb,'cancel');
      current=await calls.createCall(pool,a,sa,start());
      await assert.rejects(calls.createCall(pool,a,sa,start(other)),{status:409});
      await assert.rejects(calls.syncCalls(pool,c,sc,{tabId:tc,callId:current.id}),{status:404});
      const snapshot=await calls.syncCalls(pool,b,sb,{tabId:tb});assert.equal(snapshot.call.id,current.id);assert.equal(snapshot.call.owned,false);
      assert.ok(!JSON.stringify(snapshot).includes(sa));
    });
    await t.test('only recipient accepts; one tab wins and other tabs cannot signal or end',async()=> {
      await assert.rejects(act(current.id,a,sa,ta,'accept'),{status:409});
      const otherTab=randomUUID();const result=await Promise.allSettled([act(current.id,b,sb,tb,'accept'),act(current.id,b,sb,otherTab,'accept')]);
      assert.equal(result.filter((r)=>r.status==='fulfilled').length,1);
      const owned=(await calls.syncCalls(pool,b,sb,{tabId:tb,callId:current.id})).call.owned;
      if(!owned) {await act(current.id,b,sb,otherTab,'end');current=await calls.createCall(pool,a,sa,start());await act(current.id,b,sb,tb,'accept');}
      await assert.rejects(act(current.id,b,sb,randomUUID(),'end'),{status:409});
      await assert.rejects(calls.authorizeCallIce(pool,b,'other-session',current.id,tb),{status:404});
      await assert.rejects(signal(current.id,c,sc,tc,'ice',{candidate:'bad'}),{status:404});
      await assert.rejects(signal(current.id,b,sb,tb,'offer',{type:'offer',sdp:'v=0'}),{status:403});
      await assert.rejects(signal(current.id,b,sb,tb,'answer',{type:'answer',sdp:'v=0'}),{status:409});
    });
    await t.test('SDP and early ICE are recipient-scoped and retries cannot change payload',async()=> {
      const key=randomUUID();const first=await signal(current.id,a,sa,ta,'ice',{candidate:'early'},key);
      assert.deepEqual(await signal(current.id,a,sa,ta,'ice',{candidate:'early'},key),first);
      await assert.rejects(signal(current.id,a,sa,ta,'ice',{candidate:'changed'},key),{status:409});
      await signal(current.id,a,sa,ta,'offer',{type:'offer',sdp:'v=0\r\n'});
      const incoming=await calls.syncCalls(pool,b,sb,{tabId:tb,callId:current.id});assert.deepEqual(incoming.signals.map((s)=>s.kind),['ice','offer']);
      assert.equal((await calls.syncCalls(pool,a,sa,{tabId:ta,callId:current.id})).signals.length,0);
      await signal(current.id,b,sb,tb,'answer',{type:'answer',sdp:'v=0\r\n'});
      await act(current.id,a,sa,ta,'connected');
      assert.equal((await calls.syncCalls(pool,b,sb,{tabId:tb,callId:current.id})).call.status,'active');
      await assert.rejects(act(current.id,b,sb,tb,'reject'),{status:409});
    });
    await t.test('terminal transitions release slots, purge signaling, retain history and are idempotent',async()=> {
      await act(current.id,a,sa,ta,'end');await act(current.id,a,sa,ta,'end');
      assert.equal((await pool.query('SELECT count(*) FROM call_signals WHERE call_id=$1',[current.id])).rows[0].count,'0');
      assert.equal((await pool.query('SELECT count(*) FROM call_slots')).rows[0].count,'0');
      const history=await calls.callHistory(pool,b);assert.ok(history.some((r)=>r.id===current.id && r.duration!==null));
      assert.equal((await calls.callHistory(pool,c)).length,0);
      current=await calls.createCall(pool,a,sa,start());assert.equal((await act(current.id,b,sb,tb,'reject')).status,'rejected');assert.equal((await act(current.id,b,sb,tb,'reject')).status,'rejected');
    });
    await t.test('unanswered and disconnected calls expire and bounded cleanup removes stale signals',async()=> {
      current=await calls.createCall(pool,a,sa,start());
      await pool.query("UPDATE calls SET created_at=now()-interval '1 minute' WHERE id=$1",[current.id]);
      assert.equal((await calls.syncCalls(pool,a,sa,{callId:current.id,tabId:ta})).call.status,'missed');
      current=await calls.createCall(pool,a,sa,start());await act(current.id,b,sb,tb,'accept');
      await signal(current.id,a,sa,ta,'offer',{type:'offer',sdp:'v=0'});
      await pool.query("UPDATE call_signals SET expires_at=now()-interval '1 second'");await calls.cleanupCalls(pool);
      assert.equal((await pool.query('SELECT count(*) FROM call_signals')).rows[0].count,'0');
      await pool.query("UPDATE calls SET caller_seen=now()-interval '1 minute' WHERE id=$1",[current.id]);
      await calls.cleanupCalls(pool);assert.equal((await calls.callHistory(pool,a))[0].status,'failed');
      current=await calls.createCall(pool,a,sa,start());await pool.query('DELETE FROM sessions WHERE token_hash=$1',[sa]);
      await calls.cleanupCalls(pool);assert.equal((await calls.callHistory(pool,a))[0].status,'missed');
      assert.equal((await pool.query('SELECT count(*) FROM call_slots')).rows[0].count,'0');
    });
  } finally {await pool?.end();if(created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
