import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseConfig, migrationDatabaseConfig } from '../lib/server/database-config.mjs';
import { transaction } from '../lib/server/transaction.mjs';
import { readMessages } from '../lib/server/conversation-queries.mjs';

test('database configuration validates URLs, pool bounds and TLS without leaking secrets', () => {
  const valid = { DATABASE_URL: 'postgresql://user:private-password@ep-test.ap-southeast-1.aws.neon.tech/chatbit' };
  assert.equal(databaseConfig(valid).ssl.rejectUnauthorized, true);
  for (const env of [
    {}, { DATABASE_URL: 'private-password' }, { DATABASE_URL: 'https://example.com' },
    { ...valid, DATABASE_POOL_MAX: '0' }, { ...valid, DATABASE_POOL_MAX: '1.5' },
    { ...valid, DATABASE_SSL: 'disable' }, { ...valid, DATABASE_SSL: 'unknown' },
    { DATABASE_URL: `${valid.DATABASE_URL}?sslmode=no-verify` },
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

test('Neon URL TLS remains verified and migrations require a direct endpoint', () => {
  const direct = 'postgresql://test:private@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require';
  const pooled = direct.replace('ep-example.', 'ep-example-pooler.');
  const config = databaseConfig({ DATABASE_URL: pooled });
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
  assert.throws(() => migrationDatabaseConfig({ DATABASE_URL: pooled }), /direct/);
  assert.throws(() => migrationDatabaseConfig({ DATABASE_URL: direct, DATABASE_MIGRATION_URL: pooled }), /direct/);
  assert.equal(migrationDatabaseConfig({ DATABASE_URL: pooled, DATABASE_MIGRATION_URL: direct }).max, 1);
  assert.throws(() => databaseConfig({ DATABASE_URL: direct, DATABASE_SSL: 'disable' }), /TLS/);
});

test('database configuration only allows Neon or isolated loopback and uses system trust',()=>{
  const direct='postgresql://test:private@ep-test.ap-southeast-1.aws.neon.tech/neondb';
  assert.deepEqual(databaseConfig({DATABASE_URL:direct,DATABASE_SSL_CA:'ignored obsolete custom CA'}).ssl,{rejectUnauthorized:true});
  assert.equal(databaseConfig({DATABASE_URL:direct}).enableChannelBinding,true);
  for(const url of ['postgresql://test:private@old-provider.example/neondb',direct+'?channel_binding=require'])assert.throws(()=>databaseConfig({DATABASE_URL:url}));
  for(const patch of [{DATABASE_MIGRATION_URL:direct.replace('ep-test.','ep-other.')},{DATABASE_MIGRATION_URL:direct.replace('/neondb','/other')},{DATABASE_MIGRATION_URL:direct.replace('test:','other:')}]) {
    assert.throws(()=>migrationDatabaseConfig({DATABASE_URL:direct,DATABASE_MIGRATION_URL:direct,...patch}),/same Neon/);
  }
});
