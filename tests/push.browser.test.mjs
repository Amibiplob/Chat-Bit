import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withBrowser} from './helpers/browser.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {hashPassword} from '../lib/server/passwords.mjs';
import {createSession,resolveSession} from '../lib/server/session-core.mjs';
import {createConversation,sendMessageReceipt,getMessagePage} from '../lib/server/messaging-queries.mjs';
import {publishHints,pushChannel} from '../lib/server/push-core.mjs';
const require=createRequire(import.meta.resolve('ably'));
const {WebSocketServer}=require('ws');
const summary=values=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,p50:Math.round(a[Math.ceil(a.length*.5)-1]),p95:Math.round(a[Math.ceil(a.length*.95)-1])};};

test('two Chrome SDK subscriptions render committed PostgreSQL snapshots without polling in a protocol fixture',{
  skip:!(process.env.TEST_PUSH_BROWSER==='1'&&process.env.TEST_DATABASE_URL&&process.env.CHROME_BIN)&&'Requires isolated loopback database, Chrome and TEST_PUSH_BROWSER=1',timeout:120000,
},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  const schema='chatbit_push_'+randomUUID().replaceAll('-','');const admin=new pg.Pool({connectionString:url.href,ssl:false});
  let pool,server,broker;
  const peers=new Map(),users=[randomUUID(),randomUUID()],channels=users.map(id=>pushChannel(id,'fixture-secret'));
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:url.href,ssl:false,options:`-c search_path=${schema}`});await migrate(pool);
    const hash=await hashPassword('synthetic push fixture password');
    for(const [i,id] of users.entries())await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`push-${i}@example.invalid`,'Push Fixture '+i,hash]);
    const sessions=await Promise.all(users.map(id=>createSession(pool,id)));const chat=await createConversation(pool,users[0],{participantId:users[1]});
    const browserSdk=await readFile(new URL('./ably.js',import.meta.resolve('ably')));
    let port;
    server=createServer(async(request,response)=>{
      try{
        const path=new URL(request.url,'http://localhost').pathname;
        if(path==='/ably.js'){response.setHeader('Content-Type','text/javascript');response.end(browserSdk);return;}
        if(['/push-subscription.mjs','/push-refresh.mjs'].includes(path)){response.setHeader('Content-Type','text/javascript');response.end(await readFile(new URL('../lib'+path,import.meta.url)));return;}
        const token=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('chatbit_session='))?.split('=')[1];
        const user=await resolveSession(pool,token);if(!user){response.writeHead(401);response.end();return;}
        if(path==='/snapshot'){response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify(await getMessagePage(pool,user.id,chat,{limit:100})));return;}
        const index=users.indexOf(user.id);assert.ok(index>=0);
        // Synthetic token and loopback endpoint exist only in this test fixture.
        response.setHeader('Content-Type','text/html');response.end(`<!doctype html><main aria-label="Messages"></main><script src="/ably.js"></script><script type="module">
          import {createPushSubscription} from '/push-subscription.mjs';
          window.__rendered={};window.__events=[];window.__ready=false;
          window.__stop=createPushSubscription({
            token:async()=>({enabled:true,channel:${JSON.stringify(channels[index])},tokenRequest:'fixture-${index}'}),
            loadClient:async()=>options=>new Ably.Realtime({...options,clientId:${JSON.stringify(channels[index])},realtimeHost:'127.0.0.1',restHost:'127.0.0.1',port:${port},tls:false,useBinaryProtocol:false,transports:['web_socket'],fallbackHosts:[],disconnectedRetryTimeout:100}),
            healthy:{current:false},onEvent:()=>window.__events.push(performance.timeOrigin+performance.now()),
            refresh:async()=>{const response=await fetch('/snapshot',{cache:'no-store'});if(!response.ok)throw new Error('Unavailable');const page=await response.json();const fragment=document.createDocumentFragment();for(const row of page.messages){const p=document.createElement('p');p.dataset.messageId=row.id;p.textContent=row.content;fragment.append(p);if(!window.__rendered[row.id])window.__rendered[row.id]=performance.timeOrigin+performance.now();}document.querySelector('main').replaceChildren(fragment);window.__ready=true;}
          });</script>`);
      }catch{response.writeHead(500);response.end('Fixture unavailable');}
    });
    broker=new WebSocketServer({server});broker.on('connection',(socket,request)=>{
      const query=new URL(request.url,'http://localhost').searchParams;const index=Number(query.get('access_token')?.replace('fixture-',''));const channel=channels[index];if(!channel){socket.close();return;}
      peers.set(socket,new Set());socket.on('close',()=>peers.delete(socket));
      socket.send(JSON.stringify({action:4,connectionId:randomUUID(),connectionDetails:{connectionKey:randomUUID(),clientId:channel,maxIdleInterval:60000,connectionStateTtl:120000}}));
      socket.on('message',raw=>{const message=JSON.parse(String(raw));if(message.action===0)socket.send(JSON.stringify({action:0}));if(message.action===10){if(message.channel!==channel){socket.send(JSON.stringify({action:9,channel:message.channel,error:{statusCode:401,code:40160,message:'Denied'}}));return;}peers.get(socket)?.add(channel);socket.send(JSON.stringify({action:11,channel,channelSerial:'fixture:0'}));}if(message.action===7){socket.send(JSON.stringify({action:8}));socket.close();}});
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');port=server.address().port;const origin=`http://127.0.0.1:${port}`;
    const publish=async(channel,name,data)=>{for(const [socket,subscriptions] of peers)if(subscriptions.has(channel))socket.send(JSON.stringify({action:15,channel,messages:[{id:randomUUID(),name,data,timestamp:Date.now()}]}));};
    await withBrowser(async sender=>withBrowser(async receiver=>{
      for(const [i,browser] of [sender,receiver].entries()){await browser.command('Network.setCookie',{name:'chatbit_session',value:sessions[i].token,url:origin,httpOnly:true,sameSite:'Lax'});await browser.command('Page.navigate',{url:origin});await browser.waitFor('window.__ready');}
      const database=[],publishing=[],eventDelivery=[],recipient=[];
      for(let i=0;i<30;i++){
        const started=performance.now();const message=await sendMessageReceipt(pool,users[0],chat,{content:'Push fixture '+i,clientId:randomUUID()});database.push(performance.now()-started);
        const epoch=Date.now(),queued=performance.now();await publishHints({key:'unused'},users,'fixture-secret',publish);publishing.push(performance.now()-queued);
        await receiver.waitFor(`window.__rendered[${JSON.stringify(message.id)}]`);
        const values=await receiver.evaluate(`({event:window.__events.at(-1),dom:window.__rendered[${JSON.stringify(message.id)}]})`);eventDelivery.push(values.event-epoch);recipient.push(values.dom-epoch);
      }
      await publishHints({key:'unused'},users,'fixture-secret',publish);await publishHints({key:'unused'},users,'fixture-secret',publish);
      await receiver.waitFor(`document.querySelectorAll('main p').length===30`);assert.equal(await receiver.evaluate(`new Set(Array.from(document.querySelectorAll('main p')).map(p=>p.dataset.messageId)).size`),30);
      const missed=await sendMessageReceipt(pool,users[0],chat,{content:'Reconnect fixture',clientId:randomUUID()});
      for(const [socket,subscriptions] of peers)if(subscriptions.has(channels[1]))socket.terminate();
      await receiver.waitFor(`window.__rendered[${JSON.stringify(missed.id)}]`);
      console.log('Loopback protocol fixture only, 30 committed sends:',JSON.stringify({confirmationMs:summary(database),publishMs:summary(publishing),publishToEventMs:summary(eventDelivery),publishToRecipientDomMs:summary(recipient)}));
    }));
  }finally{
    if(broker){for(const socket of broker.clients)socket.terminate();await new Promise(resolve=>broker.close(resolve));}
    if(server)await new Promise(resolve=>server.close(resolve));await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
