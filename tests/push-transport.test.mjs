import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Realtime} from 'ably';
import {publishHints,pushChannel} from '../lib/server/push-core.mjs';
import {createPushSubscription} from '../lib/push-subscription.mjs';

// Real SDKs and loopback sockets; a deliberately tiny protocol fixture, NOT
// evidence about Ably availability, hosted credentials or production latency.
const require=createRequire(import.meta.resolve('ably'));
const {WebSocketServer}=require('ws');
const until=async predicate=>{for(let i=0;i<200&&!predicate();i++)await delay(25);assert.ok(predicate());};
test('independent SDK clients receive scoped invalidations and resync after reconnect',{
  skip:process.env.TEST_PUSH_TRANSPORT!=='1'&&'Set TEST_PUSH_TRANSPORT=1 for isolated loopback transport fixture',
  timeout:30000,
},async t=>{
  const server=createServer((request,response)=>{response.writeHead(404);response.end();});
  const sockets=new WebSocketServer({server});
  const members=new Map();
  const channels=['a','b','outsider'].map(user=>pushChannel(user,'fixture-secret'));
  sockets.on('connection',(socket,request)=>{
    const query=new URL(request.url,'http://localhost').searchParams;
    if(process.env.TEST_PUSH_DEBUG==='1')console.log('Fixture handshake keys', [...query.keys()]);
    const token=query.get('access_token');
    const allowed=channels[Number(token?.replace('fixture-',''))];
    if(!allowed){socket.close();return;}
    members.set(socket,new Set());socket.on('close',()=>members.delete(socket));
    socket.send(JSON.stringify({action:4,connectionId:randomUUID(),connectionKey:randomUUID(),connectionDetails:{connectionKey:randomUUID(),clientId:allowed,maxIdleInterval:60000,connectionStateTtl:120000}}));
    socket.on('message',raw=>{
      const message=JSON.parse(String(raw));if(process.env.TEST_PUSH_DEBUG==='1')console.log('Fixture protocol action',message.action);
      if(message.action===0)socket.send(JSON.stringify({action:0}));
      if(message.action===10){
        if(message.channel!==allowed){socket.send(JSON.stringify({action:9,channel:message.channel,error:{code:40160,statusCode:401,message:'Not authorized'}}));return;}
        members.get(socket)?.add(message.channel);socket.send(JSON.stringify({action:11,channel:message.channel,channelSerial:'fixture:0'}));
      }
      if(message.action===7){socket.send(JSON.stringify({action:8}));socket.close();}
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const clients=[];
  t.after(async()=>{for(const client of clients)client.close();for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));await new Promise(resolve=>server.close(resolve));});
  const received=[0,0,0],resync=[0,0,0],attached=[0,0,0];
  for(let i=0;i<3;i++){
    const healthy={current:false};
    const stop=createPushSubscription({
      token:async()=>({enabled:true,channel:channels[i],tokenRequest:'fixture-'+i}),
      loadClient:async()=>options=>{
        const client=new Realtime({...options,clientId:channels[i],realtimeHost:'127.0.0.1',restHost:'127.0.0.1',port:server.address().port,tls:false,
          useBinaryProtocol:false,transports:['web_socket'],fallbackHosts:[],disconnectedRetryTimeout:100});
        clients.push(client);
        client.channels.get(channels[i]).on('attached',()=>attached[i]++);
        return client;
      },
      refresh:async()=>{resync[i]++;},healthy,onEvent:()=>received[i]++,
    });
    t.after(stop);await until(()=>healthy.current);
  }
  await assert.rejects(clients[2].channels.get(channels[0]).subscribe('invalidate',()=>{}));
  const publish=async(channel,name,data)=>{
    for(const [socket,subscriptions] of members)if(subscriptions.has(channel))socket.send(JSON.stringify({action:15,channel,messages:[{id:randomUUID(),timestamp:Date.now(),name,data}]}));
  };
  await publishHints({key:'unused'},['a','b'],'fixture-secret',publish);
  await until(()=>received[0]===1&&received[1]===1);
  assert.equal(received[2],0);assert.ok(resync[0]>=2&&resync[1]>=2);
  for(const [socket,subscriptions] of members)if(subscriptions.has(channels[1]))socket.terminate();
  await until(()=>attached[1]>=2);
  assert.ok(resync[1]>=3,'Reattached subscription requests a fresh authoritative snapshot');
  await publishHints({key:'unused'},['b'],'fixture-secret',publish);
  await until(()=>received[1]===2);assert.equal(received[0],1);assert.equal(received[2],0);
});
