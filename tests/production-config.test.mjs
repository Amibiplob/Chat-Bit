import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionConfigurationErrors } from '../scripts/check-production-env.mjs';

test('production preflight requires TLS, private service configuration, TURN and scheduler authorization without making network calls',()=>{
  const env={DATABASE_URL:'postgresql://test:private@ep-test-pooler.ap-southeast-1.aws.neon.tech/chatbit',DATABASE_MIGRATION_URL:'postgresql://test:private@ep-test.ap-southeast-1.aws.neon.tech/chatbit',DATABASE_SSL:'verify',AUTH_RATE_LIMIT_SECRET:'a'.repeat(32),
    AWS_ENDPOINT_URL_S3:'https://br-test.storage.c-2.ap-southeast-1.aws.neon.tech',AWS_REGION:'ap-southeast-1',AWS_ACCESS_KEY_ID:'synthetic-id',AWS_SECRET_ACCESS_KEY:'synthetic-secret',CALL_TURN_URLS:'["turn:relay.example:3478"]',CALL_TURN_SHARED_SECRET:'b'.repeat(32),CRON_SECRET:'c'.repeat(32)};
  assert.deepEqual(productionConfigurationErrors(env),[]);
  for(const patch of [{DATABASE_SSL:'disable'},{AWS_ENDPOINT_URL_S3:'http://project.example'},{AUTH_RATE_LIMIT_SECRET:''},{CALL_TURN_URLS:'[]'},{CRON_SECRET:''},{CALL_RELAY_ONLY:'invalid'}]) {
    const errors=productionConfigurationErrors({...env,...patch});assert.ok(errors.length);assert.ok(!errors.join().includes('private'));
  }
  assert.deepEqual(productionConfigurationErrors({...env,CRON_SECRET:'',MAINTENANCE_CLEANUP_SECRET:'d'.repeat(32),ATTACHMENT_CLEANUP_SECRET:'e'.repeat(32),CALL_CLEANUP_SECRET:'f'.repeat(32)}),[]);
});

test('production preflight accepts Neon with a direct migration URL and rejects incomplete credentials or pooled migrations',()=>{
  const env={DATABASE_URL:'postgresql://synthetic@ep-test-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',DATABASE_MIGRATION_URL:'postgresql://synthetic@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require',
    AWS_ENDPOINT_URL_S3:'https://br-test.storage.c-2.us-east-2.aws.neon.tech',AWS_REGION:'us-east-2',AWS_ACCESS_KEY_ID:'synthetic-id',AWS_SECRET_ACCESS_KEY:'synthetic-secret',AUTH_RATE_LIMIT_SECRET:'a'.repeat(32),CALL_TURN_URLS:'["turn:relay.example:3478"]',CALL_TURN_SHARED_SECRET:'b'.repeat(32),CRON_SECRET:'c'.repeat(32)};
  assert.deepEqual(productionConfigurationErrors(env),[]);
  for(const patch of [{DATABASE_MIGRATION_URL:''},{AWS_SECRET_ACCESS_KEY:''},{DATABASE_MIGRATION_URL:env.DATABASE_URL}])assert.ok(productionConfigurationErrors({...env,...patch}).length);
});
