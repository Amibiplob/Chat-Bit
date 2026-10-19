import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateAttachmentObjects } from '../scripts/migrate-attachment-objects.mjs';
const row = { storageKey: 'own/legacy.txt', byteSize: 5, mimeType: 'text/plain', filename: 'legacy.txt' };
const bytes = Buffer.from('hello');
const missing = () => new Error('not found', { cause: {code:'STORAGE_404'} });
test('object migration preserves keys, verifies bytes, resumes equal objects and requires explicit copy', async () => {
  let object; let writes=0;
  const source={read:async key=>{assert.equal(key,row.storageKey);return bytes;}};
  const target={read:async()=>{if(!object)throw missing();return object;},write:async(key,value,type)=>{assert.equal(key,row.storageKey);assert.equal(type,row.mimeType);object=value;writes++;}};
  await assert.rejects(migrateAttachmentObjects([row],source,target),/explicit copy/);assert.equal(writes,0);
  assert.deepEqual(await migrateAttachmentObjects([row],source,target,true),{verified:1,copied:1});
  assert.deepEqual(await migrateAttachmentObjects([row],source,target,true),{verified:1,copied:0});assert.equal(writes,1);
  object=Buffer.from('other');
  await assert.rejects(migrateAttachmentObjects([row],source,target,true),/conflict/);assert.equal(writes,1);
});
test('object migration never writes after ambiguous access errors or invalid source content', async () => {
  const target={read:async()=>{throw new Error('denied',{cause:{code:'STORAGE_403'}});},write:async()=>assert.fail('no write')};
  await assert.rejects(migrateAttachmentObjects([row],{read:async()=>bytes},target,true));
  await assert.rejects(migrateAttachmentObjects([row],{read:async()=>Buffer.from('bad')},target,true));
});
