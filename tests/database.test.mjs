import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { transaction } from '../lib/server/transaction.mjs';
import { readMessages } from '../lib/server/conversation-queries.mjs';

test('database configuration validates URLs, pool bounds and TLS without leaking secrets', () => {
  const valid = { DATABASE_URL: 'postgresql://user:private-password@db.example/chatbit' };
  assert.equal(databaseConfig(valid).ssl.rejectUnauthorized, true);
  for (const env of [
    {}, { DATABASE_URL: 'private-password' }, { DATABASE_URL: 'https://example.com' },
    { ...valid, DATABASE_POOL_MAX: '0' }, { ...valid, DATABASE_POOL_MAX: '1.5' },
    { ...valid, DATABASE_SSL: 'disable' }, { ...valid, DATABASE_SSL: 'unknown' },
    { DATABASE_URL: `${valid.DATABASE_URL}?sslmode=no-verify` },
    { DATABASE_URL: `${valid.DATABASE_URL}?sslmode=require` },
    { DATABASE_URL: `${valid.DATABASE_URL}?ssl=false` },
    { DATABASE_URL: 'postgresql:///chatbit' },
    { DATABASE_URL: 'postgres://localhost/chatbit', DATABASE_SSL: 'disable', NODE_ENV: 'production' },
  ]) {
    assert.throws(() => databaseConfig(env), (error) => !error.message.includes('private-password'));
  }
  assert.equal(databaseConfig({ DATABASE_URL: 'postgres://127.0.0.1/chatbit', DATABASE_SSL: 'disable' }).ssl, false);
});

function fakePool(failRollback = false) {
  const commands = [];
  const client = {
    query: async (sql) => { commands.push(sql); if (failRollback && sql === 'ROLLBACK') throw new Error('disconnected'); },
    release: (discard) => commands.push(discard ? 'discard' : 'release'),
  };
  return { pool: { connect: async () => client }, commands, client };
}

test('transactions use one connection and commit before releasing', async () => {
  const { pool, commands, client } = fakePool();
  const value = await transaction(pool, async (connection) => {
    assert.equal(connection, client);
    await connection.query('operation');
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(commands, ['BEGIN', 'operation', 'COMMIT', 'release']);
});

test('failed operations rollback and preserve the original error', async () => {
  for (const failRollback of [false, true]) {
    const { pool, commands } = fakePool(failRollback);
    const original = new Error('operation failed');
    await assert.rejects(transaction(pool, async () => { throw original; }), (error) => error === original);
    assert.deepEqual(commands, ['BEGIN', 'ROLLBACK', failRollback ? 'discard' : 'release']);
  }
});

test('message page size is bounded before executing SQL', async () => {
  const client = { query: () => { throw new Error('SQL should not run'); } };
  for (const limit of [0, 101, 1.5, NaN]) {
    await assert.rejects(readMessages(client, 'user', 'conversation', limit), /Invalid page size/);
  }
});
