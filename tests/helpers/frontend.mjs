import assert from 'node:assert/strict';
import { withBrowser } from './browser.mjs';

// Uses only public pages and a deliberately invalid login. Never creates accounts.
export async function frontendJourney(origin) {
  await withBrowser(async ({command, evaluate, waitFor, fill}) => {
    const navigate = async path => {
      await command('Page.navigate', {url:origin+path});
      await waitFor(`document.querySelector('form') && Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactFiber$'))`);
    };
    await navigate('/signup');
    await evaluate(`document.querySelector('form').requestSubmit()`);
    await waitFor(`document.querySelector('#name[aria-invalid="true"]')`);
    assert.equal(await evaluate('document.activeElement.id'), 'name');
    assert.ok(await evaluate(`document.querySelector('[role="alert"]').textContent.includes('correct')`));
    for (const [field,value] of Object.entries({name:'   ',email:'not-an-email',password:'short',confirmPassword:'different'})) await fill(`input[name="${field}"]`, value);
    await evaluate(`document.querySelector('form').requestSubmit()`);
    await waitFor(`document.querySelector('#signup-password-error')?.textContent.includes('8')`);
    assert.ok(await evaluate(`document.querySelector('#signup-email-error').textContent.includes('valid email')`));
    assert.ok(await evaluate(`document.querySelector('#confirm-password-error').textContent.includes('match')`));
    assert.equal(await evaluate(`document.querySelector('#name').value`), '   ');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('[aria-invalid="true"]')).every(e=>document.getElementById(e.getAttribute('aria-describedby')?.split(' ')[0]))`));
    await evaluate(`document.querySelector('[aria-controls="signup-password"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#signup-password').type`), 'text');
    await evaluate(`document.querySelector('[aria-controls="signup-password"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#signup-password').type`), 'password');

    await navigate('/login');
    await evaluate(`window.authPosts=0;const originalFetch=window.fetch;window.fetch=async (...args)=>{if(args[1]?.method==='POST'){window.authPosts++;await new Promise(resolve=>setTimeout(resolve,200));}return originalFetch(...args);}`);
    await fill('input[name="email"]','frontend-invalid-login@example.invalid');
    await fill('input[name="password"]','invalid test password');
    await evaluate(`const form=document.querySelector('form');form.requestSubmit();form.requestSubmit();`);
    await waitFor(`document.querySelector('form[aria-busy="true"]')`);
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`),true);
    await waitFor(`document.querySelector('[role="alert"]') && document.querySelector('form[aria-busy="false"]')`);
    assert.equal(await evaluate('window.authPosts'),1,'Rapid repeated submits dispatch once');
    assert.equal(await evaluate(`document.querySelector('input[name="email"]').value`),'frontend-invalid-login@example.invalid');
    assert.equal(await evaluate(`document.querySelector('input[name="password"]').value`),'','Passwords are not restored after a server error');

    for (const path of ['/','/signup','/login','/help','/about']) {
      await command('Page.navigate',{url:origin+path});
      await waitFor(`document.readyState==='complete' && document.querySelector('h1')`);
      for(const width of [320,390,768,1280]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<768});
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${path} fits ${width}px`);
      }
    }
    await command('Page.navigate',{url:origin+'/'});
    await waitFor(`document.querySelector('[aria-label="Open navigation menu"]') && Object.keys(document.querySelector('[aria-label="Open navigation menu"]')).some(k=>k.startsWith('__reactFiber$'))`);
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.querySelector('[aria-label="Open navigation menu"]').click()`);
    await waitFor(`document.querySelector('[role="dialog"] nav[aria-label="Mobile navigation"]')`);
    await evaluate(`document.querySelector('[aria-label="Mobile navigation"] a[href="/#features"]').click()`);
    await waitFor(`location.hash==='#features' && !document.querySelector('[role="dialog"]')`);
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('footer a[href^="/#"]')).every(a=>document.getElementById(a.hash.slice(1)))`));
    assert.equal(await evaluate(`document.querySelectorAll('a[href="#"],a[href="#help"],a[href="#privacy"],a[href="#terms"]').length`),0);
    await evaluate(`localStorage.setItem('chatbit-theme','dark');window.dispatchEvent(new Event('chatbit-theme'));`);
    await waitFor(`document.documentElement.classList.contains('dark')`);
    await evaluate(`localStorage.setItem('chatbit-theme','light');window.dispatchEvent(new Event('chatbit-theme'));`);
    await waitFor(`!document.documentElement.classList.contains('dark')`);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    await evaluate(`localStorage.setItem('chatbit-theme','system');window.dispatchEvent(new Event('chatbit-theme'));`);
    await waitFor(`document.documentElement.classList.contains('dark')`);
  });
}
