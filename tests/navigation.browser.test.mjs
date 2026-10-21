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
      env:{...process.env,NODE_ENV:'development',DATABASE_URL:url.href,DATABASE_SSL:'disable',AUTH_RATE_LIMIT_SECRET:randomUUID().replaceAll('-',''),CHATBIT_AUTH_HTTP_TEST:'1',NEXT_TELEMETRY_DISABLED:'1',VERCEL:'0',CALL_STUN_URLS:'[]',CALL_TURN_URLS:'[]',CALL_TURN_SHARED_SECRET:'',AWS_ENDPOINT_URL_S3:'',AWS_ACCESS_KEY_ID:'',AWS_SECRET_ACCESS_KEY:''},
    });
    let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/login',{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await delay(500);}
    assert.ok(ready,'Isolated Next.js server starts');
    await withBrowser(async({command,evaluate,waitFor,fill})=>{
      await command('Network.setCookie',{name:'chatbit_session',value:session.token,url:origin,httpOnly:true,sameSite:'Lax'});
      await command('Page.navigate',{url:origin+'/chat/'+chats[0]});
      await waitFor(`document.querySelector('textarea[aria-label="Message"]') && Object.keys(document.querySelector('textarea')).some(k=>k.startsWith('__reactFiber$'))`);
      await evaluate(`window.__shell=document.querySelector('.cb-app-shell');window.__list=document.querySelector('[aria-label="Conversations"]');window.__documentMarker=1;
        window.__requests=[];const nativeFetch=window.fetch;window.fetch=async(...args)=>{const raw=args[0] instanceof Request?args[0].url:String(args[0]);const u=new URL(raw,location.href);const kind=u.searchParams.has('_rsc')?'rsc':u.pathname==='/api/realtime/sync'?'sync':u.pathname.startsWith('/api/')?'api':'other';window.__requests.push({kind});return nativeFetch(...args);};`);
      const switchTo=async(index)=>{
        const target='/chat/'+chats[index];
        await evaluate(`window.__requests=[];window.__navStart=performance.now();window.__feedback=null;
          window.__observer=new MutationObserver(()=>{if(window.__feedback===null&&(document.querySelector('[data-navigation-pending="true"], [data-route-loading]') || Array.from(document.querySelectorAll('[role="status"]')).some(el=>/^Loading (conversation|ChatBit)/.test(el.textContent))))window.__feedback=performance.now()-window.__navStart;});window.__observer.observe(document.body,{subtree:true,attributes:true,childList:true});
          document.querySelector('a[href="${target}"]').click();`);
        await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('textarea[aria-label="Message"]') && document.querySelector('header h1')?.textContent.trim()===${JSON.stringify('Partner '+(index===0?'One':'Two'))}`);
        return evaluate(`(()=>{window.__observer.disconnect();return {transitionMs:Math.round(performance.now()-window.__navStart),feedbackMs:window.__feedback===null?null:Math.round(window.__feedback),rscRequests:window.__requests.filter(r=>r.kind==='rsc').length,syncRequests:window.__requests.filter(r=>r.kind==='sync').length,apiRequests:window.__requests.filter(r=>r.kind==='api').length,shellRemounts:document.querySelector('.cb-app-shell')===window.__shell?0:1,documentReloads:window.__documentMarker===1?0:1};})()`);
      };
      await fill('textarea[aria-label="Message"]','Unsent local draft');
      const first=await switchTo(1);assert.equal(await evaluate('document.querySelector("textarea").value'),'');
      const second=await switchTo(0);
      const draftRestored=await evaluate('document.querySelector("textarea").value==="Unsent local draft"');
      assert.equal(first.documentReloads,0);assert.equal(first.shellRemounts,0);
      await evaluate(`document.querySelector('input[aria-label="Search conversations"]').value='';document.querySelector('a[href="/settings"]').click()`);
      await waitFor(`location.pathname==='/settings' && document.querySelector('h1')?.textContent.includes('Settings')`);
      await evaluate(`(()=>{const link=document.querySelector('a[href="/chat"]');if(link)link.click();else history.back();})()`);
      await waitFor(`location.pathname.startsWith('/chat') && document.querySelector('[aria-label="Conversations"]')`);
      const sidebarPreserved=await evaluate(`document.querySelector('[aria-label="Conversations"]')===window.__list`);
      for(const width of [320,768,1280]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Navigation fits viewport');
      }
      console.log('Isolated navigation measurements:',JSON.stringify({first,return:second,draftRestored,sidebarPreserved}));
      if(process.env.TEST_NAVIGATION_BASELINE!=='1'){assert.equal(draftRestored,true);assert.equal(sidebarPreserved,true);}
    });
  } finally {
    if(child?.pid && child.exitCode===null){const done=once(child,'exit');process.kill(-child.pid,'SIGTERM');await Promise.race([done,delay(3000)]);if(child.exitCode===null&&child.signalCode===null)process.kill(-child.pid,'SIGKILL');}
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
