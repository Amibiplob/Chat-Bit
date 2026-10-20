import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { verifySession } from '../lib/server/session-verification.mjs';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { failureDetails } from '../lib/server/messaging-diagnostics.mjs';

test('absent and malformed cookies never initialize a pool', async () => {
  for (const token of [undefined, '', 'invalid', 'a'.repeat(44)]) {
    assert.equal(await verifySession(() => assert.fail('Database must remain lazy'), token), null);
  }
});

test('missing/expired sessions are signed out and existing sessions retain database identity', async () => {
  const user = { id: 'synthetic-id', email: 'synthetic@example.invalid', displayName: 'Test' };
  for (const rows of [[], [user]]) {
    let queries = 0;
    const result = await verifySession(() => ({ query: async (sql, args) => {
      queries++;
      assert.match(sql, /s.expires_at > now\(\)/);
      assert.equal(args[0].length, 64);
      assert.notEqual(args[0], 'x'.repeat(43));
      return { rows };
    } }), 'x'.repeat(43));
    assert.equal(result, rows[0] ?? null);
    assert.equal(queries, 1);
  }
});

test('configuration, connectivity, permissions and schema failures remain distinct and fail closed without leaking causes', async () => {
  const secret = 'synthetic-private-connection-cookie-query';
  const configFailure = () => databaseConfig({ DATABASE_URL: secret });
  const failures = [
    ['DATABASE_CONFIG', configFailure],
    ...['ECONNREFUSED', 'ENOTFOUND', '28P01', '42501', '42P01', '57014'].map(code => [code, () => ({ query: async () => { throw Object.assign(new Error(secret), { code, detail: secret }); } })]),
  ];
  for (const [code, database] of failures) {
    const logs = [];
    await assert.rejects(verifySession(database, 'x'.repeat(43), (...args) => logs.push(args)), error => {
      assert.equal(error.message, 'Session verification is temporarily unavailable');
      assert.deepEqual(error.cause, { code });
      assert.ok(!inspect(error).includes(secret));
      const events = [];
      const details = failureDetails(error, 'api.read', (...args) => events.push(args));
      assert.equal(details.status, code === '57014' ? 504 : 503);
      assert.equal(events[0][1].code, code);
      assert.equal(events[0][1].stage, 'authentication');
      return true;
    });
    assert.deepEqual(logs, [['chatbit.auth.unavailable', { operation: 'session', stage: 'authentication', code }]]);
    assert.ok(!JSON.stringify(logs).includes(secret));
  }
});
