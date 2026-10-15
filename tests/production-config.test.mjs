import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionConfigurationErrors } from '../scripts/check-production-env.mjs';

test('production preflight requires TLS, private service configuration, TURN and scheduler authorization without making network calls',()=>{
  const env={DATABASE_URL:'postgresql://test:private@db.example/chatbit',DATABASE_SSL:'verify',AUTH_RATE_LIMIT_SECRET:'a'.repeat(32),
    SUPABASE_URL:'https://project.example',SUPABASE_SECRET_KEY:'test-server-only-key',CALL_TURN_URLS:'["turn:relay.example:3478"]',CALL_TURN_SHARED_SECRET:'b'.repeat(32),CRON_SECRET:'c'.repeat(32)};
  assert.deepEqual(productionConfigurationErrors(env),[]);
  for(const patch of [{DATABASE_SSL:'disable'},{SUPABASE_URL:'http://project.example'},{AUTH_RATE_LIMIT_SECRET:''},{CALL_TURN_URLS:'[]'},{CRON_SECRET:''},{CALL_RELAY_ONLY:'invalid'}]) {
    const errors=productionConfigurationErrors({...env,...patch});assert.ok(errors.length);assert.ok(!errors.join().includes('private'));
  }
  assert.deepEqual(productionConfigurationErrors({...env,CRON_SECRET:'',MAINTENANCE_CLEANUP_SECRET:'d'.repeat(32),ATTACHMENT_CLEANUP_SECRET:'e'.repeat(32),CALL_CLEANUP_SECRET:'f'.repeat(32)}),[]);
});
