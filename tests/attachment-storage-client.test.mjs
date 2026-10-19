import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAttachmentStorageClient } from '../lib/server/attachment-storage-client.mjs';
import { attachmentStorage } from '../lib/server/attachment-storage-core.mjs';
import { diagnosticRequest, diagnosticStep, failureDetails } from '../lib/server/messaging-diagnostics.mjs';

// Exercise the installed SDK's real header construction with a mocked wire.
for (const key of ['sb_secret_synthetic_test_key','eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.synthetic']) {
  test(`${key.startsWith('sb_secret_')?'opaque secret':'legacy JWT'} authenticates bucket, signing, read and cleanup via real SDK`, async () => {
    const calls=[];
    const client=createAttachmentStorageClient({url:'https://storage.invalid',key},async(input,init)=>{
      const url=new URL(input);const headers=new Headers(init.headers);
      assert.equal(headers.get('apikey'),key);
      assert.equal(headers.get('authorization'),key.startsWith('sb_secret_')?null:`Bearer ${key}`);
      calls.push([init.method,url.pathname]);
      if(url.pathname.includes('/bucket/'))return Response.json({public:false,file_size_limit:10485760});
      if(url.pathname.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/fixture/file?token=synthetic'});
      if(url.pathname.includes('/sign/'))return Response.json({signedURL:'/object/sign/fixture/file?token=synthetic'});
      if(init.method==='DELETE')return Response.json([]);
      return new Response('fixture');
    });
    const storage=attachmentStorage(client,'fixture');
    await storage.upload('file');await storage.read('file');await storage.download('file','file.txt');await storage.remove(['file']);
    assert.ok(calls.some(([method,path])=>method==='GET'&&path.endsWith('/bucket/fixture')));
    assert.ok(calls.some(([method])=>method==='DELETE'));
    assert.equal(calls.length,7);
  });
}

test('real SDK authentication rejections remain safe diagnostics after header correction', async () => {
  await diagnosticRequest(async()=>{
    const client=createAttachmentStorageClient({url:'https://storage.invalid',key:'sb_secret_synthetic_test_key'},async()=>Response.json({statusCode:'401',error:'Unauthorized',message:'private provider content'},{status:401}));
    const storage=attachmentStorage(client,'private-fixture');
    for(const [stage,run] of [['storage-bucket',()=>storage.upload('private-object')],['storage-remove',()=>storage.remove(['private-object'])]]) {
      let failure;try {await diagnosticStep(stage,run);}catch(error){failure=error;}
      const events=[];const result=failureDetails(failure,'attachment.write',(...args)=>events.push(args));
      assert.equal(result.status,503);assert.equal(events[0][1].code,'STORAGE_401');assert.equal(events[0][1].stage,stage);
      assert.equal(JSON.stringify(events).includes('private'),false);assert.equal(JSON.stringify(events).includes('sb_secret'),false);
    }
  });
});
