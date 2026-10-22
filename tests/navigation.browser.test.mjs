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
import { createConversation, sendMessage } from '../lib/server/messaging-queries.mjs';
import { withBrowser } from './helpers/browser.mjs';

// Deliberately restricted to disposable loopback PostgreSQL. Never uses .env DB URLs.
test('authenticated navigation, conversation identity, drafts and persistent shell in Chrome',{
  skip: !(process.env.TEST_NAVIGATION_BROWSER==='1' && process.env.TEST_DATABASE_URL && process.env.CHROME_BIN) && 'Set isolated TEST_DATABASE_URL, TEST_NAVIGATION_BROWSER=1 and CHROME_BIN',
  timeout:240000,
},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Navigation fixtures require loopback PostgreSQL');
  const admin=new pg.Pool({connectionString:url.href,ssl:false});
  const schema='chatbit_navigation_'+randomUUID().replaceAll('-','');
  let pool,child;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString:url.href,ssl:false,options:`-c search_path=${schema}`});await migrate(pool);
    const passwordHash=await hashPassword('isolated navigation test password');
    const ids=[randomUUID(),randomUUID(),randomUUID()];
    for(const [i,id] of ids.entries())await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`nav-${i}@example.invalid`,['Navigation Tester','Partner One','Partner Two'][i],passwordHash]);
    const session=await createSession(pool,ids[0]);
    const chats=await Promise.all(ids.slice(1).map(participantId=>createConversation(pool,ids[0],{participantId})));
    for(const [i,id] of chats.entries())await sendMessage(pool,ids[0],id,{content:`Conversation ${i+1} fixture`,clientId:randomUUID()});
    const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
    const origin=`http://127.0.0.1:${port}`;
    url.searchParams.set('options',`-c search_path=${schema}`);
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',process.env.TEST_NEXT_TURBOPACK==='1'?'--turbopack':'--webpack','--hostname','127.0.0.1','--port',String(port)],{
      detached:true,stdio:['ignore','ignore','ignore'],
      env:{...process.env,NODE_ENV:'development',DATABASE_URL:url.href,DATABASE_SSL:'disable',AUTH_RATE_LIMIT_SECRET:randomUUID().replaceAll('-',''),CHATBIT_AUTH_HTTP_TEST:'1',CHATBIT_REALTIME_PROVIDER:'',ABLY_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1',VERCEL:'0',CALL_STUN_URLS:'[]',CALL_TURN_URLS:'[]',CALL_TURN_SHARED_SECRET:'',AWS_ENDPOINT_URL_S3:'',AWS_ACCESS_KEY_ID:'',AWS_SECRET_ACCESS_KEY:''},
    });
    let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await delay(500);}
    assert.ok(ready,'Isolated Next.js server starts');
    const networkLatencyMs=Number(process.env.TEST_NAVIGATION_LATENCY_MS ?? 0);
    assert.ok(Number.isFinite(networkLatencyMs)&&networkLatencyMs>=0&&networkLatencyMs<=1000);
    await withBrowser(async({command,evaluate,waitFor,fill})=>{
      if(networkLatencyMs)await command('Network.emulateNetworkConditions',{offline:false,latency:networkLatencyMs,downloadThroughput:512000,uploadThroughput:128000});
      await command('Network.setCookie',{name:'chatbit_session',value:session.token,url:origin,httpOnly:true,sameSite:'Lax'});
      await command('Page.navigate',{url:origin+'/chat/'+chats[0]});
      await waitFor(`document.querySelector('textarea[aria-label="Message"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')).some(k=>k.startsWith('__reactFiber$'))`);
      await evaluate(`window.__shell=document.querySelector('.cb-app-shell');window.__list=document.querySelector('[aria-label="Conversations"]');window.__documentMarker=1;
        window.__requests=[];window.__syncActive=0;window.__maxSyncActive=0;const nativeFetch=window.fetch;window.fetch=async(...args)=>{const raw=args[0] instanceof Request?args[0].url:String(args[0]);const u=new URL(raw,location.href);const kind=u.searchParams.has('_rsc')?'rsc':u.pathname==='/api/realtime/sync'?'sync':u.pathname.startsWith('/api/')?'api':'other';window.__requests.push({kind});if(kind==='sync'){window.__syncActive++;window.__maxSyncActive=Math.max(window.__maxSyncActive,window.__syncActive);}try{return await nativeFetch(...args);}finally{if(kind==='sync')window.__syncActive--;}};`);
      const switchTo=async(index)=>{
        const target='/chat/'+chats[index];
        await evaluate(`window.__requests=[];window.__navStart=performance.now();window.__feedback=null;window.__contentMs=null;
          window.__observer=new MutationObserver(()=>{if(window.__contentMs===null&&location.pathname===${JSON.stringify(target)}&&document.querySelector('textarea[aria-label="Message"]')&&document.querySelector('[aria-label^="Conversation with"] header h1')?.textContent.trim()===${JSON.stringify('Partner '+(index===0?'One':'Two'))})window.__contentMs=performance.now()-window.__navStart;if(window.__feedback===null&&(document.querySelector('[data-navigation-pending="true"], [data-route-loading]') || Array.from(document.querySelectorAll('[role="status"]')).some(el=>/^Loading (conversation|ChatBit)/.test(el.textContent))))window.__feedback=performance.now()-window.__navStart;});window.__observer.observe(document.body,{subtree:true,attributes:true,childList:true});
          document.querySelector('a[href="${target}"]').click();`);
        await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('textarea[aria-label="Message"]') && document.querySelector('[aria-label^="Conversation with"] header h1')?.textContent.trim()===${JSON.stringify('Partner '+(index===0?'One':'Two'))}`);
        return evaluate(`(()=>{window.__observer.disconnect();return {contentMs:Math.round(window.__contentMs??performance.now()-window.__navStart),transitionMs:Math.round(performance.now()-window.__navStart),feedbackMs:window.__feedback===null?null:Math.round(window.__feedback),rscRequests:window.__requests.filter(r=>r.kind==='rsc').length,syncRequests:window.__requests.filter(r=>r.kind==='sync').length,apiRequests:window.__requests.filter(r=>r.kind==='api').length,shellRemounts:document.querySelector('.cb-app-shell')===window.__shell?0:1,documentReloads:window.__documentMarker===1?0:1};})()`);
      };
      await fill('textarea[aria-label="Message"]','Unsent local draft');
      const first=await switchTo(1);assert.equal(await evaluate('document.querySelector("textarea[aria-label=Message]").value'),'');
      const second=await switchTo(0);
      const draftRestored=await evaluate('document.querySelector("textarea[aria-label=Message]").value==="Unsent local draft"');
      assert.equal(first.documentReloads,0);assert.equal(first.shellRemounts,0);
      await evaluate(`document.querySelector('input[aria-label="Search conversations"]').value='';document.querySelector('a[href="/settings"]').click()`);
      await waitFor(`location.pathname==='/settings' && Array.from(document.querySelectorAll('h1')).some(el=>el.textContent.includes('Settings'))`);
      await evaluate(`(()=>{const link=document.querySelector('a[href="/chat"]');if(link)link.click();else history.back();})()`);
      await waitFor(`location.pathname.startsWith('/chat') && document.querySelector('[aria-label="Conversations"]')`);
      const sidebarPreserved=await evaluate(`document.querySelector('[aria-label="Conversations"]')===window.__list`);
      for(const width of [320,768,1280]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Navigation fits viewport');
      }
      console.log('Isolated navigation measurements:',JSON.stringify({networkLatencyMs,first,return:second,draftRestored,sidebarPreserved}));
        const warm=[];for(let i=0;i<10;i++)warm.push(await switchTo(i%2===0?1:0));
        const durations=warm.map(row=>row.contentMs).sort((a,b)=>a-b);
        console.log('Warm visited navigation DOM measurements:',JSON.stringify({samples:durations.length,p50:durations[4],p95:durations[9],rscRequests:warm.reduce((sum,row)=>sum+row.rscRequests,0),shellRemounts:warm.reduce((sum,row)=>sum+row.shellRemounts,0)}));
      if(process.env.TEST_WORKSPACE_BROWSER==='1'){
        await evaluate(`window.__workspaceFetch=window.fetch;window.fetch=(...args)=>new Promise(resolve=>setTimeout(resolve,1500)).then(()=>window.__workspaceFetch(...args));window.__workspaceSamples=[];window.__requests=[];`);
        for(let i=0;i<30;i++){
          const path=['/settings','/contacts','/calls','/chat'][i%4];
          const heading={'/settings':'Settings','/contacts':'Conversation partners','/calls':'Calls','/chat':'Select a conversation'}[path];
          await evaluate(`window.__workspaceStart=performance.now();window.__workspaceReady=null;window.__workspaceObserver=new MutationObserver(()=>{const panel=document.querySelector('[data-workspace-panel="${path}"]');const ready=panel?!panel.hidden:Array.from(document.querySelectorAll('h1,h2')).some(el=>el.getClientRects().length>0&&el.textContent.trim()===${JSON.stringify(heading)});if(location.pathname==='${path}'&&ready&&window.__workspaceReady===null)window.__workspaceReady=performance.now()-window.__workspaceStart;});window.__workspaceObserver.observe(document.body,{subtree:true,attributes:true,childList:true});document.querySelector('a[href="${path}"]').click();`);
          await waitFor(`window.__workspaceReady!==null`);
          await evaluate(`window.__workspaceSamples.push(window.__workspaceReady);window.__workspaceObserver.disconnect();`);
          if(process.env.TEST_WORKSPACE_BASELINE!=='1'&&i===0){await fill('#bio','Unsubmitted workspace profile draft');await evaluate(`window.__settingsPanel=document.querySelector('[data-workspace-panel="/settings"]');void 0`);}
          if(process.env.TEST_WORKSPACE_BASELINE!=='1'&&i===2){await fill('[aria-label="Search calls"]','Retained call filter');await evaluate(`window.__callsPanel=document.querySelector('[data-workspace-panel="/calls"]');void 0`);}

        }
        const result=await evaluate(`(()=>{const a=window.__workspaceSamples.sort((a,b)=>a-b);return {samples:a.length,p50:Math.round(a[14]),p95:Math.round(a[28]),rscRequests:window.__requests.filter(r=>r.kind==='rsc').length};})()`);
        console.log('Persistent workspace with 1500 ms delayed fetch:',JSON.stringify(result));
        if(process.env.TEST_WORKSPACE_BASELINE!=='1'){
          assert.ok(result.p95<1500,'Destination panels do not wait for delayed fetch');
          assert.equal(result.rscRequests,0,'Workspace tabs do not request destination RSC');
          assert.equal(await evaluate(`document.querySelector('[data-workspace-panel="/settings"]')===window.__settingsPanel&&document.querySelector('#bio').value==='Unsubmitted workspace profile draft'`),true,'Settings panel and unsaved input survive tab changes');
          assert.equal(await evaluate(`document.querySelector('[data-workspace-panel="/calls"]')===window.__callsPanel&&document.querySelector('[aria-label="Search calls"]').value==='Retained call filter'`),true,'Calls panel and search survive tab changes');
        }
        await evaluate(`window.fetch=window.__workspaceFetch;document.querySelector('a[href="/chat/${chats[0]}"]').click()`);
        await waitFor(`document.querySelector('textarea[aria-label="Message"]')`);
      }
      if(process.env.TEST_NAVIGATION_BASELINE!=='1'){
        assert.equal(draftRestored,true);assert.equal(sidebarPreserved,true);
        assert.ok(await evaluate('window.__maxSyncActive<=1'),'Conversation transitions keep synchronization requests serialized');
        // Test history and scroll separately, after the comparable measurements.
        await command('Emulation.setDeviceMetricsOverride',{width:1280,height:844,deviceScaleFactor:1,mobile:false});
        for(let i=0;i<55;i++)await sendMessage(pool,ids[0],chats[0],{content:`Scroll fixture ${i}`,clientId:randomUUID()});
        await command('Page.navigate',{url:origin+'/chat/'+chats[0]});
        await waitFor(`document.querySelector('textarea[aria-label="Message"]') && Object.keys(document.querySelector('textarea[aria-label="Message"]')).some(k=>k.startsWith('__reactFiber$'))`);
        await evaluate(`document.querySelector('[aria-label="Messages"]').scrollTop=0`);await delay(200);
        await switchTo(1);await switchTo(0);
        assert.ok(await evaluate(`document.querySelector('[aria-label="Messages"]').scrollTop<30`),'Returning to a reading position preserves scroll');
        await evaluate('history.back()');await waitFor(`location.pathname===${JSON.stringify('/chat/'+chats[1])} && document.querySelector('[aria-label^="Conversation with"] header h1')?.textContent.trim()==='Partner Two'`);
        await evaluate('history.forward()');await waitFor(`location.pathname===${JSON.stringify('/chat/'+chats[0])} && document.querySelector('[aria-label^="Conversation with"] header h1')?.textContent.trim()==='Partner One'`);
        // Incoming messages preserve reading position; a locally accepted send
        // must be visible immediately, even when reading older history.
        await evaluate(`document.querySelector('[aria-label="Messages"]').scrollTop=0`);await delay(200);
        await sendMessage(pool,ids[1],chats[0],{content:'Incoming while reading fixture',clientId:randomUUID()});
        await evaluate(`window.dispatchEvent(new Event('online'))`);
        await waitFor(`document.querySelector('[aria-label="Messages"]').textContent.includes('Incoming while reading fixture')`);
        assert.ok(await evaluate(`document.querySelector('[aria-label="Messages"]').scrollTop<30`),'Incoming messages preserve reading position');
        // Hold only the synthetic send acknowledgement while navigating away/back.
        await fill('textarea[aria-label="Message"]','Navigation send fixture');
        await evaluate(`window.__previousFetch=window.fetch;window.fetch=async(...args)=>{const response=await window.__previousFetch(...args);if(args[1]?.method==='POST'&&String(args[0]).endsWith('/messages')){window.__sendHeld=true;await new Promise(resolve=>{window.__releaseSend=resolve;});}return response;};document.querySelector('button[aria-label="Send message"]').click()`);
        assert.ok(await evaluate(`(()=>{const area=document.querySelector('[aria-label="Messages"]');return area.scrollHeight-area.scrollTop-area.clientHeight<2&&Array.from(document.querySelectorAll('[data-message-delivery="sending"]')).some(row=>row.textContent.includes('Navigation send fixture'));})()`),'Accepted pending send is visible before its acknowledgement');
        await waitFor('window.__sendHeld');await switchTo(1);await switchTo(0);
        assert.equal(await evaluate('document.querySelector("textarea[aria-label=Message]").disabled'),false,'Text composer stays usable after a pending-send remount');
        assert.ok(await evaluate(`document.querySelector('[aria-label="Messages"]').textContent.includes('Navigation send fixture')`),'Pending or already reconciled outgoing message survives remount');
        await evaluate('window.__releaseSend();window.fetch=window.__previousFetch');
        await waitFor(`document.querySelector('textarea[aria-label="Message"]').value===''&&!document.querySelector('textarea[aria-label="Message"]').disabled`);
        const count=await pool.query('SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1 AND body=$2',[chats[0],'Navigation send fixture']);assert.equal(count.rows[0].count,1);
        await command('Emulation.setDeviceMetricsOverride',{width:320,height:480,deviceScaleFactor:1,mobile:true});
        await evaluate('document.querySelector("textarea[aria-label=Message]").focus()');
        assert.ok(await evaluate('document.querySelector("textarea[aria-label=Message]").getBoundingClientRect().bottom<=innerHeight'),'Composer fits a shortened mobile viewport');
        await evaluate(`document.querySelector('a[aria-label="Back to conversations"]').click()`);await waitFor(`location.pathname==='/chat'`);
        await evaluate(`document.querySelector('[aria-label="Mobile navigation"] a[href="/contacts"]').click()`);
        await waitFor(`location.pathname==='/contacts' && document.querySelector('[aria-label="Mobile navigation"] a[aria-current="page"]')?.textContent.trim()==='Contacts'`);
        assert.equal(await evaluate(`document.querySelector('[aria-label="Mobile navigation"] a[aria-current="page"]').textContent.trim()`),'Contacts');
        // Fixture messages reference membership. Remove only this synthetic
        // thread's rows before simulating membership revocation.
        await pool.query('DELETE FROM messages WHERE conversation_id=$1',[chats[1]]);
        await pool.query('DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[chats[1],ids[0]]);
        await evaluate(`document.querySelector('a[href="/chat"]').click()`);await waitFor(`location.pathname==='/chat'`);
        // Sync may already have removed the revoked thread's sidebar link.
        // Native history still exercises the private cache's authorization fence.
        await evaluate(`history.pushState(null,'','/chat/${chats[1]}')`);
        await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Conversation unavailable')`);
        assert.equal(await evaluate(`Boolean(document.querySelector('textarea[aria-label="Message"]'))`),false,'Membership rejection removes cached private conversation content');
        await pool.query('DELETE FROM sessions WHERE user_id=$1',[ids[0]]);
        await evaluate(`window.dispatchEvent(new Event('online'))`);await waitFor(`location.pathname==='/login'`);
        assert.equal(await evaluate('Boolean(document.querySelector("textarea[aria-label=Message]"))'),false,'Expired session leaves the private shell');
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-workspace-panel]'))`),false,'Session rejection unmounts retained private panels');
      }
    });
  } finally {
    if(child?.pid && child.exitCode===null){const done=once(child,'exit');process.kill(-child.pid,'SIGTERM');await Promise.race([done,delay(3000)]);if(child.exitCode===null&&child.signalCode===null)process.kill(-child.pid,'SIGKILL');}
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
