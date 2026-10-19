import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { neonAttachmentStorage, sealedObjectKey } from '../lib/server/neon-storage.mjs';
import { attachmentStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { verifyAndFinalize, reconcileAttachments } from '../lib/server/attachment-workflow.mjs';

const env = { AWS_ENDPOINT_URL_S3: 'https://br-test.storage.c-2.us-east-2.aws.neon.tech', AWS_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'synthetic-id', AWS_SECRET_ACCESS_KEY: 'synthetic-secret' };
const bytes = Buffer.from('hello');
function fixture(patch = {}) {
  const calls = [];
  const responses = {
    GetBucketAclCommand: { Owner: { ID: 'owner' }, Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'owner' }, Permission: 'FULL_CONTROL' }] },
    GetBucketPolicyCommand: {},
    GetObjectCommand: () => ({ ContentLength: bytes.length, Body: Readable.from([bytes]) }),
    PutObjectCommand: {}, DeleteObjectsCommand: {}, ListObjectsV2Command: {}, ...patch,
  };
  const client = { send: async command => {
    const name = command.constructor.name; calls.push([name, command.input]);
    const result = responses[name]; if (result instanceof Error) throw result;
    return typeof result === 'function' ? result(command.input) : result;
  } };
  const sign = async (_, command, options) => { calls.push(['sign', command.input, options]); return 'https://signed.invalid/download'; };
  const post = async (_, input) => { calls.push(['post', input]); return { url: 'https://signed.invalid/upload', fields: { key: input.Key, policy: 'synthetic-policy' } }; };
  return { calls, storage: neonAttachmentStorage(attachmentStorageConfiguration(env), client, sign, post) };
}

test('Neon storage requires credentials and an HTTPS branch endpoint', () => {
  assert.equal(attachmentStorageConfiguration(env).bucket, 'chatbit-attachments');
  for (const patch of [{ AWS_ENDPOINT_URL_S3: 'http://localhost' }, { AWS_ENDPOINT_URL_S3: env.AWS_ENDPOINT_URL_S3 + '/other' }, { AWS_SECRET_ACCESS_KEY: '' }, { AWS_REGION: '' }, {AWS_REGION:'aws-ap-southeast-1'}, {AWS_REGION:'ap-southeast-1'}, { NEON_STORAGE_BUCKET: '../other' }]) {
    assert.throws(() => attachmentStorageConfiguration({ ...env, ...patch }), error => !error.message.includes('synthetic'));
  }
});

test('private bucket checks deny public, unknown and custom-allow policy metadata before signing', async () => {
  for (const patch of [
    { GetBucketAclCommand: {} },
    { GetBucketAclCommand: { Owner: { ID: 'owner' }, Grants: [{ Grantee: { Type: 'Group', URI: 'http://acs.amazonaws.com/groups/global/AllUsers' }, Permission: 'READ' }] } },
    { GetBucketPolicyCommand: { Policy: JSON.stringify({ Statement: [{ Effect: 'Allow', Principal: '*' }] }) } },
    { GetBucketPolicyCommand: new Error('secret transport details') },
  ]) {
    const { storage, calls } = fixture(patch);
    await assert.rejects(storage.upload('own/key', { byteSize: 5, mimeType: 'text/plain' }), error => !error.message.includes('secret'));
    assert.equal(calls.some(([name]) => name === 'post'), false);
  }
});

test('signed staging form binds key, exact byte length, MIME and 60-second expiry; downloads are forced private', async () => {
  const { storage, calls } = fixture();
  const signed = await storage.upload('own/key', { byteSize: 5, mimeType: 'text/plain' });
  assert.equal(signed.fields.key, 'own/key.pending');
  const policy = calls.find(([name]) => name === 'post')[1];
  assert.equal(policy.Expires, 60);
  assert.deepEqual(policy.Conditions, [['content-length-range',5,5],['eq','$Content-Type','text/plain']]);
  await storage.download('own/key', 'résumé.txt');
  const [, command, options] = calls.find(([name]) => name === 'sign');
  assert.equal(options.expiresIn, 60);
  assert.match(command.ResponseContentDisposition, /r%C3%A9sum%C3%A9/);
  assert.equal(command.ResponseCacheControl, 'private, no-store');
});

test('bounded reads reject missing/oversized/truncated bodies and sanitize provider failures', async () => {
  assert.deepEqual(await fixture().storage.read('key'), new Uint8Array(bytes));
  for (const result of [ {ContentLength: 10485761, Body: Readable.from([bytes])}, {ContentLength: 4, Body: Readable.from([bytes])}, {ContentLength: 6, Body: Readable.from([bytes])}, {} ]) {
    await assert.rejects(fixture({ GetObjectCommand: result }).storage.read('key'));
  }
  await assert.rejects(fixture({GetObjectCommand: new Error('synthetic-secret')}).storage.read('key'), error => !JSON.stringify(error).includes('synthetic-secret'));
});

test('verified bytes seal to content-addressed server objects; replay cannot target final key', async () => {
  const { storage, calls } = fixture();
  const key = await storage.seal('own/key', bytes, 'text/plain');
  assert.equal(key, sealedObjectKey('own/key', bytes));
  assert.notEqual(key, sealedObjectKey('own/key', Buffer.from('other')));
  const put = calls.find(([name]) => name === 'PutObjectCommand')[1];
  assert.equal(put.Key, key); assert.deepEqual(put.Body, bytes);
  let finalized;
  await verifyAndFinalize({ queries: { pendingAttachment: async () => ({storageKey:'own/key',byteSize:5,mimeType:'text/plain',filename:'hello.txt'}), finalizeAttachment: async (...args) => { finalized=args; return 'message'; } },
    storage: {read:storage.readUpload,seal:storage.seal},pool:{},userId:'u',conversationId:'c',attachmentId:'a',input:{} });
  assert.equal(finalized.at(-1), key);
  assert.ok(calls.some(([name,input]) => name==='GetObjectCommand' && input.Key==='own/key.pending'));
});

test('cleanup paginates, preserves available final object and detects partial delete failures', async () => {
  const key = sealedObjectKey('own/key', bytes);
  const { storage, calls } = fixture({ ListObjectsV2Command: input => input.ContinuationToken ? { Contents: [{Key:'own/key.sealed/orphan'}] } : {Contents:[{Key:key}],IsTruncated:true,NextContinuationToken:'next'} });
  await storage.prune([key]);
  let removed = calls.filter(([name]) => name==='DeleteObjectsCommand').flatMap(([,input])=>input.Delete.Objects.map(object=>object.Key));
  assert.equal(removed.includes(key), false); assert.ok(removed.includes('own/key.pending')); assert.ok(removed.includes('own/key.sealed/orphan'));
  await storage.remove([key]);
  removed = calls.filter(([name]) => name==='DeleteObjectsCommand').flatMap(([,input])=>input.Delete.Objects.map(object=>object.Key));
  assert.ok(removed.includes(key));
  await assert.rejects(fixture({DeleteObjectsCommand:{Errors:[{Code:'AccessDenied'}]}}).storage.remove(['own/key']));
  const events=[];
  await reconcileAttachments({}, {cleanupCandidates:async()=>[{id:'available',storageKey:key,uploadState:'available'}],recordCleanup:async(_,ids,ok)=>events.push([ids,ok])}, {prune:async paths=>assert.deepEqual(paths,[key]),remove:async()=>assert.fail('must preserve final')});
  assert.deepEqual(events,[[['available'],true]]);
});

test('real AWS SDK signs exact POST policy and private GET offline using the configured Neon endpoint', async () => {
  const { createNeonClient } = await import('../lib/server/neon-storage.mjs');
  const config = attachmentStorageConfiguration(env);
  const client = createNeonClient(config);
  client.send = async command => command.constructor.name === 'GetBucketAclCommand'
    ? {Owner:{ID:'owner'},Grants:[{Grantee:{Type:'CanonicalUser',ID:'owner'},Permission:'FULL_CONTROL'}]} : {};
  try {
    const storage = neonAttachmentStorage(config,client);
    const upload=await storage.upload('own/key',{byteSize:5,mimeType:'text/plain'});
    const policy=JSON.parse(Buffer.from(upload.fields.Policy,'base64').toString('utf8'));
    assert.ok(policy.conditions.some(condition=>JSON.stringify(condition)===JSON.stringify(['content-length-range',5,5])));
    assert.ok(policy.conditions.some(condition=>condition.key==='own/key.pending'));
    assert.equal(new URL(upload.signedUrl).hostname,new URL(env.AWS_ENDPOINT_URL_S3).hostname);
    assert.equal(new URL(upload.signedUrl).pathname,'/chatbit-attachments');
    const download=new URL(await storage.download('own/key','note.txt'));
    assert.equal(download.searchParams.get('X-Amz-Expires'),'60');
    assert.equal(download.searchParams.get('X-Amz-Algorithm'),'AWS4-HMAC-SHA256');
    assert.equal(download.pathname,'/chatbit-attachments/own/key');
  } finally {client.destroy();}
});
