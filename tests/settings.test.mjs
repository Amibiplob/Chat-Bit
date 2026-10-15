import assert from 'node:assert/strict';
import {test} from 'node:test';
import {profileSchema,preferencesSchema,passwordSchema,avatarMime} from '../lib/server/settings-validation.mjs';
import {normalizeTheme,resolvedTheme,subscribeTheme,changeTheme,readTheme,THEME_KEY} from '../lib/theme.mjs';
import {shouldNotify} from '../lib/notifications.mjs';
test('profile and preferences reject actor injection, oversize values and fake booleans',()=>{
  assert.deepEqual(profileSchema.parse({displayName:' Alice ',bio:' hello '}),{displayName:'Alice',bio:'hello'});
  for(const value of [{displayName:' ',bio:''},{displayName:'a',bio:'x'.repeat(161)},{displayName:'a',bio:'',userId:'other'}]) assert.equal(profileSchema.safeParse(value).success,false);
  const prefs={notifyMessages:true,notifyCalls:false,showOnline:true,showLastSeen:false};assert.deepEqual(preferencesSchema.parse(prefs),prefs);
  assert.equal(preferencesSchema.safeParse({...prefs,showOnline:'false'}).success,false);assert.equal(preferencesSchema.safeParse({...prefs,userId:'other'}).success,false);
  assert.deepEqual(preferencesSchema.parse({notifyMessages:false}),{notifyMessages:false});
  assert.equal(preferencesSchema.safeParse({}).success,false);
  assert.equal(preferencesSchema.safeParse({showOnline:null}).success,false);
});
test('password changes require bounded current and matching different strong new passwords',()=>{
  const value={currentPassword:'old password',newPassword:'new password phrase',confirmPassword:'new password phrase'};
  assert.ok(passwordSchema.safeParse(value).success);
  for(const patch of [{currentPassword:''},{newPassword:'short'},{confirmPassword:'different'},{currentPassword:value.newPassword},{newPassword:'a'.repeat(129)},{userId:'other'}]) assert.equal(passwordSchema.safeParse({...value,...patch}).success,false);
});
test('avatar signatures reject SVG, arbitrary bytes and oversized content',()=>{
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16)]);assert.equal(avatarMime(png),'image/png');
  for(const bytes of [Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.alloc(40),Buffer.alloc(262145)]) assert.throws(()=>avatarMime(bytes));
});
test('theme validates stored values and resolves live system appearance',()=>{
  assert.equal(normalizeTheme('malicious'),'system');assert.equal(resolvedTheme('system',true),'dark');assert.equal(resolvedTheme('system',false),'light');assert.equal(resolvedTheme('light',true),'light');assert.equal(resolvedTheme('dark',false),'dark');
});
test('theme subscriptions follow device and cross-tab changes and clean up listeners',()=>{
  const names=['window','document','localStorage','matchMedia'];
  const original=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
  const events=new EventTarget(),media=new EventTarget(),storage=new Map();
  media.matches=false;let dark=false,updates=0;
  try {
    Object.defineProperties(globalThis,{
      window:{configurable:true,value:events},
      document:{configurable:true,value:{documentElement:{classList:{toggle:(_name,value)=>{dark=value;}}}}},
      localStorage:{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},
      matchMedia:{configurable:true,value:()=>media},
    });
    const stop=subscribeTheme(()=>updates++);
    assert.equal(dark,false);
    changeTheme('dark');assert.equal(dark,true);assert.equal(readTheme(),'dark');
    changeTheme('system');assert.equal(dark,false);
    media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(dark,true);
    storage.set(THEME_KEY,'light');events.dispatchEvent(new Event('storage'));assert.equal(dark,false);
    const before=updates;stop();
    media.dispatchEvent(new Event('change'));events.dispatchEvent(new Event('storage'));
    assert.equal(updates,before);
  } finally {
    names.forEach((name,index)=>{if(original[index])Object.defineProperty(globalThis,name,original[index]);else delete globalThis[name];});
  }
});
test('notifications require enabled preference, hidden document and granted permission',()=>{
  assert.ok(shouldNotify({hidden:true,permission:'granted',enabled:true}));
  for(const patch of [{hidden:false},{permission:'denied'},{permission:'default'},{enabled:false}]) assert.equal(shouldNotify({hidden:true,permission:'granted',enabled:true,...patch}),false);
});

test('avatar normalization rejects corrupt raster bytes and strips metadata with bounded output',async()=>{
  const {default:sharp}=await import('sharp');
  const {normalizeAvatar}=await import('../lib/server/avatar-image.mjs');
  const source=await sharp({create:{width:300,height:300,channels:3,background:'#336699'}}).withMetadata().png().toBuffer();
  const clean=await normalizeAvatar(source),metadata=await sharp(clean).metadata();
  assert.equal(metadata.width,256);assert.equal(metadata.height,256);assert.equal(metadata.exif,undefined);assert.ok(clean.length<262144);
  await assert.rejects(normalizeAvatar(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)])),{status:400});
});
