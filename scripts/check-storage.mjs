import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { attachmentStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { createNeonClient, neonAttachmentStorage } from '../lib/server/neon-storage.mjs';

export function storageCorsMatches(rules, origin) {
  let url;try{url=new URL(origin);}catch{return false;}
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) return false;
  return Array.isArray(rules) && rules.every(rule=>rule.AllowedOrigins?.every(value=>typeof value==='string' && !value.includes('*'))) && rules.some(rule =>
    rule.AllowedOrigins?.includes(origin) && !rule.AllowedOrigins.some(value=>value.includes('*')) &&
    ['POST','GET','HEAD'].every(method=>rule.AllowedMethods?.includes(method)) &&
    rule.AllowedHeaders?.some(value=>['content-type','*'].includes(value.toLowerCase())));
}

// Explicit read-only operator command. No object writes or bucket changes.
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  config({path:['.env.local','.env'],quiet:true});
  let client;
  try {
    const origin=process.argv[2];
    if(!origin)throw new Error('Supply expected application origin');
    const settings=attachmentStorageConfiguration();client=createNeonClient(settings);
    await neonAttachmentStorage(settings,client).privateBucket();
    const result=await client.send(new GetBucketCorsCommand({Bucket:settings.bucket}),{abortSignal:AbortSignal.timeout(20000)});
    if(!storageCorsMatches(result.CORSRules,origin))throw new Error('CORS does not match the application origin');
    console.log('PASS: private bucket metadata and exact-origin upload/download CORS. No objects or settings changed.');
  } catch {console.error('Storage readiness failed; check expected origin, Neon endpoint/region/credential, privacy metadata and CORS. Values withheld.');process.exitCode=1;}
  finally {client?.destroy();}
}
