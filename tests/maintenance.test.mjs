import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupAuthorized, cleanupResponse } from '../lib/server/cleanup.mjs';

test('cleanup requires a configured long bearer secret and fails closed without running work', async () => {
  const secret='a'.repeat(32);
  for (const [token,key] of [[null,secret],['Bearer wrong',secret],[`Bearer ${secret}`,undefined],[`Bearer ${secret}`,'short']]) {
    const request=new Request('https://chatbit.test/api/maintenance/cleanup',{headers:token?{Authorization:token}:{}});
    assert.equal(cleanupAuthorized(request,key),false);
    const response=await cleanupResponse(request,key,()=>assert.fail('Unauthorized work'));
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const request=new Request('https://chatbit.test/api/maintenance/cleanup',{headers:{Authorization:`Bearer ${secret}`}});
  assert.equal((await cleanupResponse(request,secret,async()=>{})).status,200);
  const failure=await cleanupResponse(request,secret,async()=>{throw new Error('private database credentials');});
  assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('credentials'));
});
