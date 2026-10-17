import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withBrowser } from './browser.mjs';

// All interactions use the rendered application in two independent cookie jars.
export async function browserJourney(origin) {
  const diagnostic=phase=>{if(process.env.DEBUG_CHATBIT_BROWSER==='1')console.log(`Two-user journey: ${phase}`);};
  const suffix=randomUUID().slice(0,8),password='isolated browser journey password';
  await withBrowser(async alice=>withBrowser(async bob=>{
    for(const page of ['/','/login','/signup']) {
      await alice.command('Page.navigate',{url:origin+page});
      await alice.waitFor(`location.pathname===${JSON.stringify(page)} && document.readyState==='complete' && document.querySelector('h1')`);
      for(const width of [320,390,768,1280]) {
        await alice.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
        assert.ok(await alice.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${page} fits ${width}px`);
      }
    }
    async function register(browser,name,email) {
      await browser.command('Page.navigate',{url:`${origin}/signup`});
      await browser.waitFor(`document.querySelector('input[name="name"]') && Object.keys(document.querySelector('input[name="name"]')).some(k=>k.startsWith('__reactFiber$'))`);
      for(const [key,value] of Object.entries({name,email,password,confirmPassword:password})) await browser.fill(`input[name="${key}"]`,value);
      await browser.evaluate(`document.querySelector('#terms').click();document.querySelector('button[type="submit"]').click()`);
      await browser.waitFor(`location.pathname==='/chat' && document.querySelector('[aria-label="New conversation"]')`);
    }
    const email=`journey-alice-${suffix}@example.com`,partner=`journey-bob-${suffix}@example.com`;
    await register(alice,`Journey Alice ${suffix}`,email);
    await register(bob,`Journey Bob ${suffix}`,partner);
    diagnostic('both accounts registered');
    await alice.evaluate(`document.querySelector('button[aria-label="Sign out"]').click()`);
    await alice.waitFor(`location.pathname==='/login' && document.querySelector('input[name="email"]')`);
    await alice.fill('input[name="email"]',email);await alice.fill('input[name="password"]',password);
    await alice.evaluate(`document.querySelector('button[type="submit"]').click()`);
    await alice.waitFor(`location.pathname==='/chat'`);
    diagnostic('logout and login verified');
    await alice.command('Page.navigate',{url:`${origin}/contacts`});
    await alice.waitFor(`document.querySelector('[aria-label="New conversation"]') && Object.keys(document.querySelector('[aria-label="New conversation"]')).some(k=>k.startsWith('__reactFiber$')) && document.body.innerText.includes('Conversation partners')`);
    await alice.evaluate(`document.querySelector('[aria-label="New conversation"]').click()`);
    await alice.waitFor(`document.querySelector('input[name="userSearch"]')`);await alice.fill('input[name="userSearch"]',partner);
    await alice.evaluate(`document.querySelector('input[name="userSearch"]').closest('form').querySelector('button').click()`);
    await alice.waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Journey Bob ${suffix}')`);
    await alice.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Journey Bob ${suffix}').click()`);
    await alice.waitFor(`location.pathname.startsWith('/chat/') && document.querySelector('textarea')`);
    const path=await alice.evaluate('location.pathname');
    diagnostic('contact search created conversation');
    const text=`Journey message ${suffix}`,edited=`Journey edited ${suffix}`,reply=`Journey reply ${suffix}`;
    await alice.fill('textarea',text);await alice.evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
    await bob.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`);
    await bob.command('Page.navigate',{url:origin+path});
    await bob.waitFor(`document.querySelector('textarea') && document.body.innerText.includes(${JSON.stringify(text)})`);
    await alice.waitFor(`document.querySelector('[aria-label="Read"]')`);
    diagnostic('message received and read');
    const group=phrase=>`Array.from(document.querySelectorAll('[role="group"][aria-label^="Message from"]')).find(g=>g.innerText.includes(${JSON.stringify(phrase)}))`;
    await alice.evaluate(`(()=>{const g=${group(text)};g.focus();g.querySelector('[aria-label="Edit message"]').click();})()`);
    await alice.fill('textarea',edited);await alice.evaluate(`document.querySelector('[aria-label="Save message"]').click()`);
    await bob.waitFor(`document.body.innerText.includes(${JSON.stringify(edited)})`);
    await bob.evaluate(`(()=>{const g=${group(edited)};g.focus();g.querySelector('[aria-label="Reply"]').click();})()`);
    await bob.fill('textarea',reply);await bob.evaluate(`document.querySelector('[aria-label="Send message"]').click()`);
    await alice.waitFor(`document.body.innerText.includes(${JSON.stringify(reply)})`);
    await alice.command('Page.reload');
    await alice.waitFor(`document.querySelector('textarea') && Object.keys(document.querySelector('textarea')).some(k=>k.startsWith('__reactFiber$')) && !document.querySelector('textarea').disabled && document.body.innerText.includes(${JSON.stringify(reply)})`);
    assert.ok(await alice.evaluate(`document.querySelector('blockquote')?.innerText.includes(${JSON.stringify(edited)})`));
    await alice.evaluate(`(()=>{const g=${group(edited)};g.focus();g.querySelector('[aria-label="Delete message"]').click();})()`);
    await bob.waitFor(`document.body.innerText.includes('Message deleted')`);
    diagnostic('edit, reply, persistence and deletion verified');
    for(const width of [320,390,768,1280]) {
      await bob.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
      assert.ok(await bob.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Conversation fits ${width}px`);
    }
    await alice.command('Page.navigate',{url:`${origin}/settings`});
    await alice.waitFor(`document.querySelector('button[aria-label="Sign out"]') && Object.keys(document.querySelector('button[aria-label="Sign out"]')).some(k=>k.startsWith('__reactFiber$'))`);
    await alice.evaluate(`document.querySelector('button[aria-label="Sign out"]').click()`);
    await alice.waitFor(`location.pathname==='/login'`);
    await alice.command('Page.navigate',{url:origin+path});await alice.waitFor(`location.pathname==='/login'`);
    diagnostic('responsive conversation and final logout verified');
  }));
}
