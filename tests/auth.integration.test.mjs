import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { registerAccount, loginAccount } from '../lib/server/auth-service.mjs';
import { resolveSession, revokeSession, sessionHash } from '../lib/server/session-core.mjs';
import { enforceAuthRateLimit } from '../lib/server/auth-rate-limit.mjs';

test('authentication against isolated PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run PostgreSQL authentication tests',
}, async (t) => {
  const settings = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const schema = `chatbit_auth_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool(settings);
  let pool;
  let created = false;
  const context = () => ({ clientId: randomUUID(), secret: 'test-rate-limit-secret-with-32-characters' });
  const credentials = { name: 'Test User', email: 'Test@Example.com', password: 'test passphrase 12345' };
  let registered;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
    await migrate(pool);
    await t.test('registration normalizes email and creates a hashed seven-day session', async () => {
      registered = await registerAccount(pool, credentials, context());
      const user = await resolveSession(pool, registered.token);
      assert.deepEqual(Object.keys(user).sort(), ['displayName', 'email', 'id']);
      assert.equal(user.displayName, 'Test User');
      assert.equal(user.email, 'test@example.com');
      const row = (await pool.query('SELECT * FROM sessions WHERE token_hash = $1', [sessionHash(registered.token)])).rows[0];
      assert.notEqual(row.token_hash, registered.token);
      assert.equal(row.expires_at - row.created_at, 604800000);
      assert.match((await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0].password_hash, /^\$argon2id\$/);
    });
    await t.test('duplicate normalized email is rejected without adding a session', async () => {
      await assert.rejects(registerAccount(pool, { ...credentials, email: ' TEST@example.COM ' }, context()), { code: 'REGISTRATION_FAILED' });
      assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count, '1');
      assert.equal((await pool.query('SELECT count(*) FROM sessions')).rows[0].count, '1');
    });
    await t.test('concurrent duplicate registrations create only one account', async () => {
      const input = { ...credentials, email: 'race@example.com' };
      const results = await Promise.allSettled([registerAccount(pool, input, context()), registerAccount(pool, input, context())]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'REGISTRATION_FAILED');
    });
    await t.test('valid login rotates the current session and invalid login has generic errors', async () => {
      const login = await loginAccount(pool, credentials, { ...context(), previousToken: registered.token });
      assert.notEqual(login.token, registered.token);
      assert.equal(await resolveSession(pool, registered.token), null);
      assert.equal((await resolveSession(pool, login.token)).email, 'test@example.com');
      registered = login;
      for (const input of [{ ...credentials, password: 'wrong password' }, { ...credentials, email: 'unknown@example.com' }]) {
        await assert.rejects(loginAccount(pool, input, context()), { code: 'CREDENTIALS', message: 'Invalid email or password.' });
      }
    });
    await t.test('unknown and expired sessions cannot authenticate', async () => {
      assert.equal(await resolveSession(pool, 'a'.repeat(43)), null);
      await pool.query("UPDATE sessions SET created_at=now()-interval '8 days', expires_at=now()-interval '1 day' WHERE token_hash=$1", [sessionHash(registered.token)]);
      assert.equal(await resolveSession(pool, registered.token), null);
    });
    await t.test('logout revokes the session and repeated logout is harmless', async () => {
      const session = await loginAccount(pool, credentials, context());
      assert.ok(await resolveSession(pool, session.token));
      await revokeSession(pool, session.token);
      assert.equal(await resolveSession(pool, session.token), null);
      await revokeSession(pool, session.token);
      assert.equal((await pool.query('SELECT count(*) FROM sessions WHERE token_hash=$1', [sessionHash(session.token)])).rows[0].count, '0');
    });
    await t.test('invalid registration does not create a user', async () => {
      await assert.rejects(registerAccount(pool, { ...credentials, email: 'invalid@example.com', password: 'short' }, context()), { code: 'VALIDATION' });
      assert.equal((await pool.query('SELECT count(*) FROM users WHERE email=$1', ['invalid@example.com'])).rows[0].count, '0');
    });
    await t.test('atomic rate limits withstand concurrent requests and reset after expiry', async () => {
      const client = randomUUID();
      const secret = context().secret;
      const results = await Promise.allSettled(Array.from({ length: 16 }, () => enforceAuthRateLimit(pool, 'login', 'limit@example.com', client, secret)));
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
      assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.code === 'RATE_LIMIT').length, 6);
      assert.ok((await pool.query('SELECT key_hash FROM auth_rate_limits')).rows.every((r) => /^[a-f0-9]{64}$/.test(r.key_hash)));
      await pool.query('UPDATE auth_rate_limits SET expires_at=now()-interval \'1 second\'');
      await enforceAuthRateLimit(pool, 'login', 'limit@example.com', client, secret);
    });
    await t.test('client-wide quotas prevent bypass through changing email addresses', async () => {
      const client = randomUUID();
      const secret = context().secret;
      const results = await Promise.allSettled(Array.from({ length: 31 }, (_, i) => enforceAuthRateLimit(pool, 'login', `rotating${i}@example.com`, client, secret)));
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 30);
      assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.code === 'RATE_LIMIT').length, 1);
      const registrationClient = randomUUID();
      for (let i = 0; i < 5; i++) await enforceAuthRateLimit(pool, 'register', 'signup-limit@example.com', registrationClient, secret);
      await assert.rejects(enforceAuthRateLimit(pool, 'register', ' SIGNUP-LIMIT@example.COM ', randomUUID(), secret), { code: 'RATE_LIMIT' });
    });
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); }
  }
});
