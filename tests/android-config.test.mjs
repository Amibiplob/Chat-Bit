import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionOrigin,assetLinks,twaManifest,debugManifest,PACKAGE_ID } from '../android/config.mjs';
const env={CHATBIT_ANDROID_ORIGIN:'https://chatbit.test',ANDROID_SHA256_FINGERPRINTS:Array(32).fill('AB').join(':')};
test('debug packaging needs a real HTTPS origin but no release identity or signing secrets',()=>{
 const value=debugManifest({CHATBIT_ANDROID_ORIGIN:env.CHATBIT_ANDROID_ORIGIN});
 assert.equal(value.packageId,PACKAGE_ID+'.debug');
 assert.equal(value.launcherName,'ChatBit Debug');
 assert.deepEqual(value.fingerprints,[]);
 assert.throws(()=>debugManifest({}));
 assert.throws(()=>twaManifest({CHATBIT_ANDROID_ORIGIN:env.CHATBIT_ANDROID_ORIGIN}));
 assert.throws(()=>assetLinks({CHATBIT_ANDROID_ORIGIN:env.CHATBIT_ANDROID_ORIGIN}));
});
test('Android config fails closed without an actual HTTPS origin and signing certificate',()=>{for(const value of [undefined,'http://site.test','https://localhost','https://site.test/path','https://user:password@site.test','https://site.test?key=secret'])assert.throws(()=>productionOrigin(value));assert.throws(()=>assetLinks({}));assert.throws(()=>assetLinks({...env,ANDROID_SHA256_FINGERPRINTS:'bad'}));const links=assetLinks(env);assert.equal(links[0].target.package_name,PACKAGE_ID);assert.equal(links[0].target.sha256_cert_fingerprints.length,1);});
test('TWA config uses one backend, stable package, release version and no notification delegation',()=>{const config=twaManifest(env);assert.equal(config.packageId,'com.chatbit.messenger');assert.equal(config.startUrl,'/chat');assert.equal(config.webManifestUrl,'https://chatbit.test/manifest.webmanifest');assert.equal(config.enableNotifications,false);assert.equal(config.fallbackType,'customtabs');assert.deepEqual(config.additionalTrustedOrigins,[]);assert.ok(!JSON.stringify(config).includes('password'));for(const patch of [{ANDROID_VERSION_CODE:'0'},{ANDROID_VERSION_NAME:'1;bad'}])assert.throws(()=>twaManifest({...env,...patch}));});
