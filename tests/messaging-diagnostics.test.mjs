import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticRequest, diagnosticStep, failureDetails, requestOperation } from '../lib/server/messaging-diagnostics.mjs';
import { MessagingError } from '../lib/server/messaging-validation.mjs';
import { neonAttachmentStorage } from '../lib/server/neon-storage.mjs';
const deniedStorage = (error) => neonAttachmentStorage({bucket:'private-project'}, {send:async()=>{throw error;}});

test('messaging logs contain only fixed labels, allowlisted codes and generated correlation IDs', async () => {
  await diagnosticRequest(async () => {
    const secret = 'private SQL token project URL certificate';
    let failure;
    try { await diagnosticStep('authentication', async () => { throw new Error(secret, { cause: { code: '28P01', detail: secret } }); }); } catch (error) { failure = error; }
    const events = [];
    const details = failureDetails(failure, 'message.write', (...args) => events.push(args));
    assert.equal(details.status, 503);
    assert.match(details.requestId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(events[0][1], { operation: 'message.write', stage: 'authentication', code: '28P01', category: 'database', requestId: details.requestId });
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(requestOperation('POST', 'https://example.invalid/api/conversations/secret/attachments/private/complete?token=secret'), 'attachment.complete');
    const unknown = [];
    failureDetails({ code: secret }, secret, (...args) => unknown.push(args));
    assert.equal(JSON.stringify(unknown).includes(secret), false);
  });
});

test('caught cleanup errors do not contaminate subsequent errors; concurrent requests have separate IDs', async () => {
  const results = await Promise.all([1,2].map(() => diagnosticRequest(async () => {
    await diagnosticStep('storage-remove', async () => { throw new Error('ignored'); }).catch(() => {});
    let error;
    try { await diagnosticStep('database', async () => { throw { code: 'ETIMEDOUT' }; }); } catch (caught) { error = caught; }
    const events = [];
    const result = failureDetails(error, 'message.write', (...args) => events.push(args));
    assert.equal(events[0][1].stage, 'database');
    assert.equal(events[0][1].category, 'timeout');
    assert.equal(result.status, 504);
    return result.requestId;
  })));
  assert.notEqual(results[0], results[1]);
});

test('validation, authentication, size and quota statuses stay meaningful', () => {
  for (const [status, category] of [[400,'validation'],[401,'authentication'],[403,'authorization'],[413,'file_size'],[429,'quota']]) {
    const logs = [];
    const result = failureDetails(new MessagingError('Safe public explanation', status), 'attachment.write', (...args) => logs.push(args));
    assert.equal(result.status, status);
    assert.equal(result.message, 'Safe public explanation');
    assert.equal(logs[0][1].category, category);
  }
});

test('storage bucket authorization errors retain safe status without provider details', async () => {
  await diagnosticRequest(async () => {
    const storage = deniedStorage(Object.assign(new Error('private credentials'),{$metadata:{httpStatusCode:403}}));
    let failure;
    try { await storage.upload('private-path'); } catch (error) { failure = error; }
    const logs = [];
    failureDetails(failure, 'attachment.write', (...args) => logs.push(args));
    assert.equal(logs[0][1].code, 'STORAGE_403');
    assert.equal(logs[0][1].stage, 'storage-bucket');
    assert.equal(logs[0][1].category, 'storage');
    assert.equal(JSON.stringify(logs).includes('private'), false);
  });
});

test('internal failures and account quota have distinct safe diagnostic categories', () => {
  const logs = [];
  assert.equal(failureDetails(new Error('private'), 'api.request', (...args) => logs.push(args)).status, 500);
  assert.equal(logs[0][1].category, 'internal');
  const quota = failureDetails(new MessagingError('Your attachment quota would be exceeded.', 413, 'ATTACHMENT_QUOTA'), 'attachment.write', (...args) => logs.push(args));
  assert.equal(quota.status, 413);
  assert.equal(logs[1][1].category, 'quota');
});

test('Neon SDK HTTP and timeout codes retain safe diagnostics without provider values', async () => {
  for(const [error,code] of [[Object.assign(new Error('private-token'),{$metadata:{httpStatusCode:403}}),'STORAGE_403'],[Object.assign(new Error('private-token'),{$metadata:{httpStatusCode:504}}),'STORAGE_504'],[Object.assign(new Error('private-token'),{code:'ETIMEDOUT'}),'ETIMEDOUT'],[new Error('private-token'),'STORAGE_PROVIDER']]) {
    let failure;try{await deniedStorage(error).upload('private-object',{byteSize:5,mimeType:'text/plain'});}catch(value){failure=value;}
    const events=[];const result=failureDetails(failure,'attachment.write',(...args)=>events.push(args));
    assert.equal(events[0][1].code,code);assert.equal(events[0][1].stage,'storage-bucket');
    assert.equal(result.status,['STORAGE_504','ETIMEDOUT'].includes(code)?504:503);assert.ok(!JSON.stringify(events).includes('private'));
  }
});

test('unknown or public bucket metadata denies signing and retains a safe diagnostic',async()=>{
  for(const acl of [{},{Owner:{ID:'owner'},Grants:[{Grantee:{Type:'Group',URI:'public'},Permission:'READ'}]}]) {
    const storage=neonAttachmentStorage({bucket:'private-project'},{send:async()=>acl},async()=>assert.fail('must not sign'),async()=>assert.fail('must not sign'));
    let failure;try{await storage.upload('private-object',{byteSize:5,mimeType:'text/plain'});}catch(error){failure=error;}
    const events=[];failureDetails(failure,'attachment.write',(...args)=>events.push(args));assert.equal(events[0][1].code,'STORAGE_BUCKET_PUBLIC');
  }
});

test('SDK unknown errors retain only allowlisted nested network codes and bound cyclic traversal', async () => {
  const {diagnosticCode}=await import('../lib/server/auth-diagnostics.mjs');
  assert.equal(diagnosticCode({originalError:{cause:{code:'ETIMEDOUT',message:'private-token'}}}),'ETIMEDOUT');
  const cyclic={code:'private-token'};cyclic.originalError=cyclic;
  assert.equal(diagnosticCode(cyclic),'UNCLASSIFIED');
});
