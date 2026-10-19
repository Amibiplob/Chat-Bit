import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachmentStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { diagnosticStep, failureDetails } from '../lib/server/messaging-diagnostics.mjs';
const env={AWS_ENDPOINT_URL_S3:'https://br-test.storage.c-2.ap-southeast-1.aws.neon.tech',AWS_REGION:'ap-southeast-1',AWS_ACCESS_KEY_ID:'synthetic-id',AWS_SECRET_ACCESS_KEY:'synthetic-secret'};
test('Neon storage defaults to the private attachment bucket with independent server credentials',()=>{
  assert.equal(attachmentStorageConfiguration(env).bucket,'chatbit-attachments');
  assert.equal(attachmentStorageConfiguration({...env,NEON_STORAGE_BUCKET:'custom-private'}).bucket,'custom-private');
});
test('missing storage configuration produces safe diagnostics without values',async()=>{
  for(const key of ['AWS_ENDPOINT_URL_S3','AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','NEON_STORAGE_BUCKET']) {
    let failure;try{await diagnosticStep('storage-config',async()=>attachmentStorageConfiguration({...env,[key]:''}));}catch(error){failure=error;}
    const events=[];assert.equal(failureDetails(failure,'attachment.write',(...args)=>events.push(args)).status,503);
    assert.equal(events[0][1].code,'STORAGE_CONFIG_NEON');assert.ok(!JSON.stringify(events).includes('synthetic'));assert.ok(!JSON.stringify(events).includes('neon.tech'));
  }
});
