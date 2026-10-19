import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMessagingResponse, MessagingRequestError } from '../lib/messaging-response.mjs';
test('messaging transport explains non-JSON failures and preserves status for session recovery', async () => {
  await assert.rejects(readMessagingResponse(new Response('<private gateway diagnostic>', { status: 502 })), error => error instanceof MessagingRequestError && error.status === 502 && !error.message.includes('private'));
  await assert.rejects(readMessagingResponse(new Response('<html>expired</html>', { status: 401 })), error => error.status === 401 && error.message.includes('session expired'));
  await assert.rejects(readMessagingResponse(Response.json({ error: 'File quota reached' }, { status: 400 })), /File quota reached/);
  await assert.rejects(readMessagingResponse(Response.json(null)), /incomplete response/);
  assert.deepEqual(await readMessagingResponse(Response.json({ id: 'confirmed' })), { id: 'confirmed' });
  assert.deepEqual(await readMessagingResponse(Response.json([])), []);
});
