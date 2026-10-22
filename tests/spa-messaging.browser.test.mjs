import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { migrate } from '../scripts/migrate.mjs';
import { hashPassword } from '../lib/server/passwords.mjs';
import { createSession } from '../lib/server/session-core.mjs';
import { createConversation } from '../lib/server/messaging-queries.mjs';
import { withBrowser } from './helpers/browser.mjs';

const summary = values => {
  const sorted = [...values].sort((a,b)=>a-b);
  return {samples:sorted.length,p50:Math.round(sorted[Math.ceil(sorted.length*.5)-1]),p95:Math.round(sorted[Math.ceil(sorted.length*.95)-1])};
};
test('two-account latency and recoverable optimistic messaging in isolated Chrome', {
  skip: !(process.env.TEST_SPA_BROWSER==='1' && process.env.TEST_DATABASE_URL && process.env.CHROME_BIN) && 'Requires disposable loopback PostgreSQL and Chrome',
  timeout:300000,
},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const admin=new pg.Pool({connectionString:url.href,ssl:false});
  const schema='chatbit_spa_'+randomUUID().replaceAll('-','');
  let pool,child;const spans=new Map();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString:url.href,ssl:false,options:`-c search_path=${schema}`});await migrate(pool);
    const users=[randomUUID(),randomUUID(),randomUUID()];
    const password=await hashPassword('isolated browser fixture password');
    for(const [i,id] of users.entries())await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`spa-${i}@example.invalid`,`Fixture ${i}`,password]);
    const sessions=await Promise.all(users.slice(0,2).map(id=>createSession(pool,id)));
    const chats=await Promise.all(users.slice(1).map(participantId=>createConversation(pool,users[0],{participantId})));
    const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
    const origin=`http://127.0.0.1:${port}`;url.searchParams.set('options',`-c search_path=${schema}`);
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',process.env.TEST_NEXT_TURBOPACK==='1'?'--turbopack':'--webpack','--hostname','127.0.0.1','--port',String(port)],{
      detached:true,stdio:['ignore','pipe','ignore'],env:{...process.env,NODE_ENV:'development',DATABASE_URL:url.href,DATABASE_SSL:'disable',CHATBIT_PERFORMANCE:'1',CHATBIT_AUTH_HTTP_TEST:'1',AUTH_RATE_LIMIT_SECRET:randomUUID().replaceAll('-',''),NEXT_TELEMETRY_DISABLED:'1',VERCEL:'0',CALL_STUN_URLS:'[]',CALL_TURN_URLS:'[]',CALL_TURN_SHARED_SECRET:'',AWS_ENDPOINT_URL_S3:'',AWS_ACCESS_KEY_ID:'',AWS_SECRET_ACCESS_KEY:''},
    });
    let fragment='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      const lines=(fragment+chunk).split('\n');fragment=lines.pop().slice(-16000);
      for(const line of lines){
        if(!line.startsWith('chatbit.performance '))continue;
        try{const event=JSON.parse(line.slice('chatbit.performance '.length));
          if(event.operation!=='messaging'||!['authentication','rate-limit','validation','insert','commit','pool'].includes(event.stage)||!Number.isFinite(event.durationMs))continue;
          const trace=spans.get(event.correlationId)??{};trace[event.stage]=event.durationMs;spans.set(event.correlationId,trace);
          if(spans.size>2000)spans.delete(spans.keys().next().value);
        }catch{/* Ignore framework output; never retain or print private paths. */}
      }
    });
    let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await delay(500);}assert.ok(ready);
    await withBrowser(async sender=>withBrowser(async receiver=>{
      for(const [index,browser] of [sender,receiver].entries()){
        await browser.command('Network.setCookie',{name:'chatbit_session',value:sessions[index].token,url:origin,httpOnly:true,sameSite:'Lax'});
        await browser.command('Page.navigate',{url:origin+'/chat/'+chats[0]});
        await browser.waitFor(`document.querySelector('textarea') && Object.keys(document.querySelector('textarea')).some(k=>k.startsWith('__reactFiber$'))`);
        await browser.evaluate(`window.__seen={};window.__confirmed={};window.__observer=new MutationObserver(()=>{for(const p of document.querySelectorAll('[aria-label="Messages"] p')){if(p.textContent.startsWith('Latency fixture ')&&!window.__seen[p.textContent])window.__seen[p.textContent]=performance.timeOrigin+performance.now();if(p.textContent.startsWith('Latency fixture ')&&!window.__confirmed[p.textContent]&&['sent','read'].includes(p.closest('[data-message-delivery]')?.dataset.messageDelivery))window.__confirmed[p.textContent]=performance.timeOrigin+performance.now();}});window.__observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-message-delivery']});`);
      }
      await sender.evaluate(`window.__acks=[];window.__requests={sync:0,rsc:0,other:0};const original=window.fetch;window.fetch=async(...args)=>{const u=new URL(args[0] instanceof Request?args[0].url:String(args[0]),location.href);window.__requests[u.pathname==='/api/realtime/sync'?'sync':u.searchParams.has('_rsc')?'rsc':'other']++;const start=performance.now();const response=await original(...args);if(args[1]?.method==='POST'&&u.pathname.endsWith('/messages')){const elapsed=performance.now()-start;const bytes=new TextEncoder().encode(await response.clone().text()).length;window.__acks.push({elapsed,bytes,status:response.status,timing:response.headers.get('Server-Timing')});}return response;};`);
      const optimistic=[],confirmation=[],confirmedRender=[],recipient=[],database=[],responseBytes=[];
      for(let i=0;i<12;i++){
        const text=`Latency fixture ${i}`;
        await sender.fill('textarea[aria-label="Message"]',text);
        const start=await sender.evaluate(`(()=>{window.__start=performance.timeOrigin+performance.now();document.querySelector('button[aria-label="Send message"]').click();return window.__start;})()`);
        try { await sender.waitFor(`window.__seen[${JSON.stringify(text)}] && window.__acks.length>=${i+1}`); }
        catch(error){console.log('Synthetic send diagnostics:',await sender.evaluate(`({seen:Object.keys(window.__seen).length,acks:window.__acks.map(a=>a.status),pending:document.querySelectorAll('[role="status"]').length,empty:document.querySelector('textarea').value==='',hasAlert:!!document.querySelector('[role="alert"]')})`));throw error;}
        await receiver.waitFor(`window.__seen[${JSON.stringify(text)}]`);
        optimistic.push(await sender.evaluate(`window.__seen[${JSON.stringify(text)}]-window.__start`));
        if(process.env.TEST_SPA_BASELINE!=='1'){
          await sender.waitFor(`window.__confirmed[${JSON.stringify(text)}]`);
          confirmedRender.push((await sender.evaluate(`window.__confirmed[${JSON.stringify(text)}]`))-start);
        }
        const ack=await sender.evaluate(`window.__acks[${i}]`);assert.equal(ack.status,200);confirmation.push(ack.elapsed);responseBytes.push(ack.bytes);
        const db=Number(/db;dur=([\d.]+)/.exec(ack.timing)?.[1]);if(Number.isFinite(db))database.push(db);
        recipient.push((await receiver.evaluate(`window.__seen[${JSON.stringify(text)}]`))-start);
        await sender.waitFor(`!document.querySelector('textarea').disabled && document.querySelector('textarea').value===''`);
      }
      const counts=await sender.evaluate('window.__requests');
      const persisted=[...spans.values()].filter(trace=>Number.isFinite(trace.insert));
      const serverStages={};for(const stage of ['authentication','rate-limit','validation','insert','commit','pool']){const values=persisted.map(trace=>trace[stage]).filter(Number.isFinite);if(values.length)serverStages[stage]=summary(values);}
      console.log('Isolated SPA messaging measurements:',JSON.stringify({optimisticMs:summary(optimistic),responseMs:summary(confirmation),confirmedDomMs:summary(confirmedRender),recipientMs:summary(recipient),warmRecipientMs:summary(recipient.slice(1)),transactionMs:summary(database),acknowledgementBytes:summary(responseBytes),serverStages,senderRequests:counts}));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1',[chats[0]])).rows[0].n,12);
      if(process.env.TEST_SPA_BASELINE==='1')return;
      // Delay/fail the acknowledgement only after the real commit. Retry must
      // reuse the submission ID and reconcile a response lost after persistence.
      await sender.evaluate(`window.__realFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.__realFetch(...args);if(args[1]?.method==='POST'&&String(args[0]).endsWith('/messages')){window.__held=true;await new Promise(resolve=>window.__release=resolve);throw new TypeError('Synthetic lost acknowledgement');}return response;};`);
      await sender.fill('textarea[aria-label="Message"]','Lost acknowledgement fixture');
      await sender.evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);await sender.waitFor('window.__held');
      assert.equal(await sender.evaluate(`document.querySelector('textarea').value`),'');
      assert.equal(await sender.evaluate(`document.querySelector('textarea').disabled`),false,'Composer remains responsive during a text send');
      await sender.evaluate(`document.querySelector('a[href="/chat/${chats[1]}"]').click()`);await sender.waitFor(`location.pathname==='/chat/${chats[1]}' && document.querySelector('textarea')`);
      assert.equal(await sender.evaluate(`document.querySelector('[aria-label="Messages"]').textContent.includes('Lost acknowledgement fixture')`),false);
      await sender.evaluate(`window.fetch=window.__realFetch;window.__release();document.querySelector('a[href="/chat/${chats[0]}"]').click()`);
      await sender.waitFor(`location.pathname==='/chat/${chats[0]}' && document.querySelector('textarea')`);
      // A sync may already confirm it; otherwise retry its failed outbox entry.
      await sender.waitFor(`document.querySelector('[aria-label="Messages"]').textContent.includes('Lost acknowledgement fixture')`);
      const retry=await sender.evaluate(`!!document.querySelector('button[aria-label="Retry message"]')`);
      if(retry){await sender.evaluate(`document.querySelector('button[aria-label="Retry message"]').click()`);await sender.waitFor(`!document.querySelector('button[aria-label="Retry message"]')`);}
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND body=$2',[chats[0],'Lost acknowledgement fixture'])).rows[0].n,1);
      await sender.evaluate(`window.__workingFetch=window.fetch;window.fetch=(...args)=>args[1]?.method==='POST'&&String(args[0]).endsWith('/messages')?Promise.resolve(Response.json({error:'Synthetic unavailable'}, {status:503})):window.__workingFetch(...args);`);
      await sender.fill('textarea[aria-label="Message"]','Recoverable failure fixture');
      await sender.evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
      await sender.fill('textarea[aria-label="Message"]','Newer draft while saving');
      await sender.waitFor(`document.querySelector('button[aria-label="Retry message"]')`);
      assert.equal(await sender.evaluate(`document.querySelector('textarea').value`),'Newer draft while saving');
      await sender.evaluate(`window.fetch=window.__workingFetch;document.querySelector('button[aria-label="Retry message"]').click()`);
      await sender.waitFor(`Array.from(document.querySelectorAll('[data-message-delivery=sent],[data-message-delivery=read]')).some(row=>row.textContent.includes('Recoverable failure fixture'))`);
      assert.equal(await sender.evaluate(`document.querySelector('textarea').value`),'Newer draft while saving');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id=$1 AND body=$2',[chats[0],'Recoverable failure fixture'])).rows[0].n,1);
      await sender.command('Network.setCookie',{name:'chatbit_session',value:sessions[1].token,url:origin,httpOnly:true,sameSite:'Lax'});
      const status=await sender.evaluate(`fetch('/api/conversations/${chats[0]}/messages',{method:'POST',headers:{'Content-Type':'application/json','X-ChatBit-Account':${JSON.stringify(users[0])}},body:JSON.stringify({content:'Wrong account fixture',clientId:crypto.randomUUID()})}).then(response=>response.status)`);
      assert.equal(status,401,'A changed cookie cannot send from the previous account UI');
      await sender.evaluate(`window.dispatchEvent(new Event('online'))`);
      await sender.waitFor(`location.pathname==='/chat'&&!document.querySelector('textarea')`);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE body=$1',['Wrong account fixture'])).rows[0].n,0);
    }));
  }finally{
    if(child?.pid&&child.exitCode===null){const done=once(child,'exit');process.kill(-child.pid,'SIGTERM');await Promise.race([done,delay(3000)]);if(child.exitCode===null&&child.signalCode===null)process.kill(-child.pid,'SIGKILL');}
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
