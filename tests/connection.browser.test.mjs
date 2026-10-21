import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { withBrowser } from './helpers/browser.mjs';

test('native Chrome negotiates trickle ICE and receives media using the calling controller', {
  skip: !(process.env.TEST_CALLING_BROWSER === '1' && process.env.CHROME_BIN) && 'Set TEST_CALLING_BROWSER=1 and CHROME_BIN for isolated native WebRTC',
  timeout: 45000,
},async()=>{
  const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const perf=moduleUrl(await readFile(new URL('../lib/connection-performance.mjs',import.meta.url),'utf8'));
  const client=moduleUrl((await readFile(process.env.TEST_CALLING_BASELINE_FILE ?? new URL('../lib/calling-client.mjs',import.meta.url),'utf8')).replace("'./connection-performance.mjs'",JSON.stringify(perf)));
  const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated WebRTC test</title>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    await withBrowser(async({command,evaluate,waitFor})=>{
      await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});
      await waitFor(`document.readyState==='complete'`);
      await evaluate(`(async()=>{
        const {createCallingController}=await import(${JSON.stringify(client)});
        const a=crypto.randomUUID(),b=crypto.randomUUID(),id=crypto.randomUUID(),conversationId=crypto.randomUUID();
        let call=null;const signals=[],states={},controllers=[];const start=performance.now();
        const make=(user)=>createCallingController({userId:user,tabId:crypto.randomUUID(),onChange:s=>{states[user]=s;},
          getMedia:c=>navigator.mediaDevices.getUserMedia(c),createPeer:c=>new RTCPeerConnection(c),makeStream:()=>new MediaStream(),
          request:async(url,options)=>{
            const body=options?.body?JSON.parse(options.body):{};
            const owned=()=>call?{...call,owned:call.callerId===user || call.status!=='ringing'}:null;
            if(url==='/api/calls'){call={id,conversationId,callerId:a,calleeId:b,kind:'voice',status:'ringing',name:'Test',createdAt:new Date().toISOString()};return owned();}
            if(url==='/api/calls/sync')return {call:owned(),signals:signals.filter(s=>s.user!==user&&s.sequence>body.after)};
            if(url.includes('/ice?'))return {iceServers:[]};
            if(url.endsWith('/signals')){signals.push({...body.signal,user,sequence:signals.length+1});return {sequence:signals.length};}
            if(body.action==='accept')call={...call,status:'connecting'};
            if(body.action==='connected')call={...call,status:'active',connectedAt:new Date().toISOString()};
            if(['end','cancel','fail'].includes(body.action))call={...call,status:'ended'};
            return owned();
          }});
        const caller=make(a),callee=make(b);controllers.push(caller,callee);window.__controllers=controllers;
        caller.begin();callee.begin();await caller.start(conversationId,'voice');callee.wake();
        const until=async test=>{const deadline=performance.now()+20000;while(!test()){if(performance.now()>deadline)throw new Error('Local WebRTC timed out');await new Promise(r=>setTimeout(r,25));}};
        await until(()=>states[b]?.call?.status==='ringing');await callee.act('accept');
        await until(()=>[a,b].every(user=>states[user]?.phase==='Connected'&&states[user].remote?.getTracks().some(track=>!track.muted)));
        const readyMs=Math.round(performance.now()-start);
        window.__callResult={readyMs,iceSignals:signals.filter(s=>s.kind==='ice').length,remoteTracks:[states[a].remote.getTracks().length,states[b].remote.getTracks().length],offers:signals.filter(s=>s.kind==='offer').length,answers:signals.filter(s=>s.kind==='answer').length};
        controllers.forEach(c=>c.stop());
      })()`);
      const result=await evaluate('window.__callResult');
      assert.equal(result.offers,1);assert.equal(result.answers,1);assert.ok(result.iceSignals>0);
      assert.ok(result.remoteTracks.every(n=>n>0));
      console.log('Isolated native Chrome call:',JSON.stringify(result));
    },['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
