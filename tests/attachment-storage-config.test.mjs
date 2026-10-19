import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachmentStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { diagnosticStep, failureDetails } from '../lib/server/messaging-diagnostics.mjs';

test('attachment Storage has independent server credentials and defaults to its private bucket', () => {
  const env={SUPABASE_URL:'https://storage.invalid',SUPABASE_SECRET_KEY:'private-test-key'};
  assert.equal(attachmentStorageConfiguration(env).bucket,'chatbit-attachments');
  assert.equal(attachmentStorageConfiguration({...env,SUPABASE_STORAGE_BUCKET:'custom-private'}).bucket,'custom-private');
});

test('Storage configuration failures identify the missing contract without emitting values', async () => {
  const env={SUPABASE_URL:'https://storage.invalid',SUPABASE_SECRET_KEY:'private-test-key'};
  for(const [patch,code] of [[{SUPABASE_URL:''},'STORAGE_CONFIG_URL'],[{SUPABASE_SECRET_KEY:''},'STORAGE_CONFIG_KEY'],[{SUPABASE_STORAGE_BUCKET:''},'STORAGE_CONFIG_BUCKET']]) {
    let failure;
    try {await diagnosticStep('storage-config',async()=>attachmentStorageConfiguration({...env,...patch}));} catch(error) {failure=error;}
    const events=[];
    assert.equal(failureDetails(failure,'attachment.write',(...args)=>events.push(args)).status,503);
    assert.equal(events[0][1].code,code);
    assert.equal(events[0][1].stage,'storage-config');
    assert.equal(JSON.stringify(events).includes('private'),false);
    assert.equal(JSON.stringify(events).includes('storage.invalid'),false);
  }
});
