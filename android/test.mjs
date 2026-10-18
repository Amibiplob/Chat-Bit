import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { twaManifest, debugManifest } from './config.mjs';
import { generateProject } from './project.mjs';
const require=createRequire(import.meta.url);
const {TwaManifest}=require('@bubblewrap/core');
const {fetchUtils}=require('@bubblewrap/core/dist/lib/FetchUtils.js');
const original=fetchUtils.fetch;
const directory=await mkdtemp(join(tmpdir(),'chatbit-twa-fixture-'));
try{
 const value=twaManifest({CHATBIT_ANDROID_ORIGIN:'https://chatbit.test',ANDROID_SHA256_FINGERPRINTS:Array(32).fill('AB').join(':')});
 const manifest=new TwaManifest(value);assert.equal(manifest.validate(),null);
 fetchUtils.fetch=async raw=>{const url=new URL(raw);assert.equal(url.origin,'https://chatbit.test');if(url.pathname==='/manifest.webmanifest')return new Response(JSON.stringify({name:'ChatBit',start_url:'/chat',display:'standalone'}),{headers:{'Content-Type':'application/manifest+json'}});assert.ok(url.pathname.startsWith('/icons/'));return new Response(await readFile(new URL('../public/icons/chatbit-512.png',import.meta.url)),{headers:{'Content-Type':'image/png'}});};
 await generateProject(directory,value);
 const xml=await readFile(join(directory,'app/src/main/AndroidManifest.xml'),'utf8');
 const gradle=await readFile(join(directory,'app/build.gradle'),'utf8');
 assert.match(xml,/android\.intent\.category\.BROWSABLE/);assert.match(xml,/android:exported="true"/);assert.ok(!xml.includes('android.permission.MANAGE_EXTERNAL_STORAGE'));
 assert.match(gradle,/com\.chatbit\.messenger/);
 assert.match(gradle,/buildToolsVersion '36.1.0'/);
 assert.ok(!(await readFile(join(directory,'build.gradle'),'utf8')).includes('jcenter()'));
 const wrapper=await readFile(join(directory,'gradle/wrapper/gradle-wrapper.properties'),'utf8');assert.match(wrapper,/gradle-8\.11\.1/);
 console.log('PASS: isolated Bubblewrap Android source generation with fixture assets. Not an APK compile, signing or DAL test.');
}finally{fetchUtils.fetch=original;await rm(directory,{recursive:true,force:true});}

const debugDirectory=await mkdtemp(join(tmpdir(),'chatbit-debug-generation-'));
try {
 const value=debugManifest({CHATBIT_ANDROID_ORIGIN:'https://chatbit.test'});
 assert.equal(value.packageId,'com.chatbit.messenger.debug');
 assert.deepEqual(value.fingerprints,[]);
 // No network or release credentials: use the actual checked-in packaging assets.
 fetchUtils.fetch=()=>{throw new Error('Debug generation must not fetch remote assets');};
 await generateProject(debugDirectory,value,{localAssets:true});
 const gradle=await readFile(join(debugDirectory,'app/build.gradle'),'utf8');
 assert.match(gradle,/com\.chatbit\.messenger\.debug/);
 assert.match(gradle,/ChatBit Debug/);
 assert.match(gradle,/buildToolsVersion '36.1.0'/);
 console.log('PASS: debug Android generation from repository assets without release signing or remote downloads. Not APK compilation.');
} finally {fetchUtils.fetch=original;await rm(debugDirectory,{recursive:true,force:true});}
