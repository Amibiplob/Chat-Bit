import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import { callSignalSchema, createCallSchema, callActionSchema, transitionCall } from '../lib/server/calling-validation.mjs';
import { callIceConfiguration } from '../lib/server/calling-ice.mjs';
import { createCallingController } from '../lib/calling-client.mjs';
const a=randomUUID(),b=randomUUID(),tab=randomUUID();
const call=(extra={})=>({id:randomUUID(),conversationId:randomUUID(),callerId:a,calleeId:b,kind:'voice',status:'ringing',createdAt:new Date().toISOString(),answeredAt:null,connectedAt:null,endedAt:null,endingReason:null,owned:true,name:'Partner',...extra});
test('call inputs reject spoofed actors, invalid IDs, unsafe types and oversized SDP/ICE',()=> {
  const input={conversationId:randomUUID(),clientId:randomUUID(),tabId:tab,kind:'voice'};
  assert.ok(createCallSchema.safeParse(input).success);
  for(const patch of [{kind:'group'},{callerId:a},{conversationId:'../../'},{tabId:''}]) assert.equal(createCallSchema.safeParse({...input,...patch}).success,false);
  assert.equal(callActionSchema.safeParse({tabId:tab,action:'record'}).success,false);
  const signal=(kind,payload)=>({tabId:tab,clientId:randomUUID(),signal:{kind,payload}});
  assert.ok(callSignalSchema.safeParse(signal('offer',{type:'offer',sdp:'v=0\r\n'})).success);
  for(const value of [signal('offer',{type:'answer',sdp:'v=0'}),signal('offer',{type:'offer',sdp:'v=0'+'x'.repeat(48000)}),signal('ice',{candidate:'x'.repeat(4097)}),signal('ice',{candidate:'candidate',sdpMLineIndex:-1})]) assert.equal(callSignalSchema.safeParse(value).success,false);
});
test('state machine restricts answering/rejection, supports cancellation and idempotent termination',()=> {
  const row=call();
  assert.equal(transitionCall(row,b,'accept'),'connecting');assert.equal(transitionCall(row,b,'reject'),'rejected');assert.equal(transitionCall(row,a,'cancel'),'cancelled');
  assert.throws(()=>transitionCall(row,a,'accept'));assert.throws(()=>transitionCall(row,a,'reject'));assert.throws(()=>transitionCall(row,b,'cancel'));
  assert.throws(()=>transitionCall(row,randomUUID(),'accept'),{status:404});
  const connecting={...row,status:'connecting'};
  assert.equal(transitionCall(connecting,b,'accept'),'connecting');assert.equal(transitionCall(connecting,a,'connected'),'active');
  assert.equal(transitionCall(connecting,a,'end'),'ended');assert.equal(transitionCall(connecting,b,'fail'),'failed');
  assert.equal(transitionCall({...row,status:'ended'},a,'end'),'ended');assert.throws(()=>transitionCall({...row,status:'ended'},b,'accept'));
});
test('TURN credentials expire, use HMAC and never expose the shared secret',()=> {
  const secret='a'.repeat(40),env={CALL_TURN_URLS:'["turn:relay.example.com:3478","turns:relay.example.com:5349"]',CALL_TURN_SHARED_SECRET:secret};
  const config=callIceConfiguration(env,a,'call-id',1000000);
  const turn=config.iceServers[1];assert.equal(turn.username,`4600:${a}:call-id`);
  assert.equal(turn.credential,createHmac('sha1',secret).update(turn.username).digest('base64'));
  assert.ok(!JSON.stringify(config).includes(secret));assert.equal(config.iceTransportPolicy,'all');
  assert.equal(callIceConfiguration({...env,CALL_RELAY_ONLY:'1'},a,'id').iceTransportPolicy,'relay');
  assert.throws(()=>callIceConfiguration({CALL_RELAY_ONLY:'1'},a,'id'));
  assert.throws(()=>callIceConfiguration({CALL_STUN_URLS:'["https://evil.example"]'},a,'id'));
  assert.throws(()=>callIceConfiguration({...env,CALL_TURN_SHARED_SECRET:'short'},a,'id'));
});
function fixture(overrides={}) {
  const events=[],tracks=[{id:'audio',kind:'audio',enabled:true,stop(){events.push('stop-audio');}},{id:'video',kind:'video',enabled:true,stop(){events.push('stop-video');}}];
  const stream={getTracks:()=>tracks,getAudioTracks:()=>[tracks[0]],getVideoTracks:()=>[tracks[1]],addTrack:()=>{}};
  const peer={connectionState:'new',localDescription:null,remoteDescription:null,
    addTrack(){events.push('add-track');},close(){events.push('close-peer');},
    async createOffer(){return {type:'offer',sdp:'v=0'};},async createAnswer(){return {type:'answer',sdp:'v=0'};},
    async setLocalDescription(value){this.localDescription={...value,toJSON:()=>value};events.push('local');},
    async setRemoteDescription(value){this.remoteDescription=value;events.push('remote');},
    async addIceCandidate(){assert.ok(this.remoteDescription);events.push('ice');},
  };
  let current=call();
  const request=async(url,options)=> {
    const body=options?.body?JSON.parse(options.body):{};
    events.push([url,body]);
    if(url==='/api/calls') return current;
    if(url.endsWith('/signals')) return {sequence:1};
    if(url.includes('/ice?')) return {iceServers:[]};
    if(url==='/api/calls/sync') return {call:null,signals:[]};
    if(body.action==='fail') return {...current,status:'failed'};
    if(body.action==='connected') return {...current,status:'active',connectedAt:new Date().toISOString()};
    if(body.action==='end') return {...current,status:'ended'};
    if(body.action==='accept') return {...current,status:'connecting'};
    return current;
  };
  const controller=createCallingController({userId:a,tabId:tab,onChange:()=>{},request,getMedia:async()=>{events.push('get-media');return stream;},
    createPeer:()=>peer,makeStream:()=>stream,...overrides});
  return {controller,events,peer,tracks,current,setCall:(row)=>{current=row;}};
}
test('media permission is lazy; outgoing calls mute, toggle camera and tear down all tracks',async()=> {
  const f=fixture();assert.deepEqual(f.events,[]);
  await f.controller.start(randomUUID(),'video');assert.ok(f.events.includes('get-media'));
  f.controller.mute();assert.equal(f.tracks[0].enabled,false);f.controller.mute();assert.equal(f.tracks[0].enabled,true);
  f.controller.camera();assert.equal(f.tracks[1].enabled,false);
  await f.controller.act('end');assert.ok(f.events.includes('stop-audio'));assert.ok(f.events.includes('stop-video'));assert.equal(f.controller.getState().local,null);
});
test('caller creates one offer; ICE arriving before answer waits for remote description',async()=> {
  const f=fixture(),row=call({status:'connecting'});f.setCall(row);
  await f.controller.receive({call:row,signals:[{sequence:1,kind:'ice',payload:{candidate:'early'}}]});
  assert.ok(!f.events.includes('ice'));
  await f.controller.receive({call:row,signals:[{sequence:1,kind:'ice',payload:{candidate:'early'}},{sequence:2,kind:'answer',payload:{type:'answer',sdp:'v=0'}}]});
  assert.ok(f.events.indexOf('ice')>f.events.indexOf('remote'));
  assert.equal(f.events.filter((e)=>Array.isArray(e)&&e[1].signal?.kind==='offer').length,1);
  await f.controller.receive({call:row,signals:[{sequence:2,kind:'answer',payload:{type:'answer',sdp:'v=0'}}]});
  assert.equal(f.events.filter((e)=>e==='remote').length,1);
  f.controller.stop();assert.ok(f.events.includes('close-peer'));
});
test('callee applies offer and sends answer; another tab cannot acquire media',async()=> {
  const f=fixture({userId:b}),row=call({status:'connecting'});f.setCall(row);
  await f.controller.receive({call:row,signals:[{sequence:1,kind:'offer',payload:{type:'offer',sdp:'v=0'}}]});
  assert.equal(f.events.filter((e)=>Array.isArray(e)&&e[1].signal?.kind==='answer').length,1);f.controller.stop();
  const other=fixture();await other.controller.receive({call:{...row,owned:false},signals:[]});assert.ok(!other.events.includes('get-media'));other.controller.stop();
});
test('permission and peer failures report errors and stop acquired media',async()=> {
  const denied=fixture({getMedia:async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});}});
  await denied.controller.start(randomUUID(),'voice');assert.match(denied.controller.getState().error,/permission was denied/);
  const f=fixture(),row=call({status:'connecting'});f.setCall(row);await f.controller.receive({call:row,signals:[]});
  f.peer.connectionState='failed';f.peer.onconnectionstatechange();await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(f.controller.getState().local,null);assert.equal(f.controller.getState().call.status,'failed');
});
test('media captured after unmount is stopped and never creates a call',async()=> {
  let release;const media=new Promise((resolve)=>{release=resolve;});const f=fixture({getMedia:()=>media});
  const starting=f.controller.start(randomUUID(),'voice');f.controller.stop();
  release({getTracks:()=>f.tracks});await starting;
  assert.ok(f.events.includes('stop-audio'));assert.ok(!f.events.some((e)=>Array.isArray(e)&&e[0]==='/api/calls'));
});

test('ending during signaling loss stops tracks immediately and stale live snapshots cannot restart media',async()=> {
  const row=call();let captures=0,stops=0;
  const track={enabled:true,kind:'audio',stop(){stops++;}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track],getVideoTracks:()=>[]};
  const controller=createCallingController({userId:a,tabId:tab,onChange:()=>{},
    getMedia:async()=>{captures++;return stream;},createPeer:()=>{throw new Error('must not connect');},makeStream:()=>stream,
    request:async(url)=>{if(url==='/api/calls') return row;throw new Error('network down');}});
  await controller.start(row.conversationId,'voice');await controller.act('end');
  assert.equal(stops,1);assert.equal(controller.getState().local,null);assert.equal(controller.getState().call.status,'ended');
  await controller.receive({call:{...row,status:'connecting'},signals:[]});assert.equal(captures,1);assert.equal(controller.getState().call.status,'ended');
});

test('an in-flight ringing poll cannot overwrite a completed answer action',async()=> {
  const row=call({callerId:b,calleeId:a,owned:false});
  let release,scheduled;
  const f=fixture({request:async(url,options)=> {
    if(url==='/api/calls/sync') return new Promise((resolve)=>{release=resolve;});
    if(url.includes('/ice?')) return {iceServers:[]};
    const body=JSON.parse(options.body);
    assert.equal(body.action,'accept');
    return {...row,status:'connecting',owned:true};
  },setTimer:(callback)=>{scheduled=callback;return 1;},clearTimer:()=>{}});
  await f.controller.receive({call:row,signals:[]});
  f.controller.begin();
  await f.controller.act('accept');
  release({call:row,signals:[]});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(f.controller.getState().call.status,'connecting');
  assert.equal(f.controller.getState().call.owned,true);
  assert.equal(typeof scheduled,'function');
  // Avoid a teardown transport request in this narrowly scoped fixture.
  await f.controller.receive({call:{...row,status:'ended'},signals:[]});
  f.controller.stop();
});

test('end action keeps dismissal and redial disabled until server termination completes',async()=>{
  let release;const row=call();
  const f=fixture({request:async(url,options)=>{
    if(url==='/api/calls') return row;
    if(JSON.parse(options.body).action==='end') return new Promise(resolve=>{release=resolve;});
    throw new Error('Unexpected request');
  }});
  await f.controller.start(row.conversationId,'voice');
  const ending=f.controller.act('end');assert.equal(f.controller.getState().working,true);
  f.controller.dismiss();assert.equal(f.controller.getState().call.id,row.id);
  release({...row,status:'ended'});await ending;
  assert.equal(f.controller.getState().working,false);f.controller.dismiss();assert.equal(f.controller.getState().call,null);
});
