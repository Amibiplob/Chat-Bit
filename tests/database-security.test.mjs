import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { migrate } from '../scripts/migrate.mjs';

const directory = new URL('../db/migrations/', import.meta.url);
const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
const sources = await Promise.all(files.map(name => readFile(new URL(name, directory), 'utf8')));
const security = sources[files.indexOf('008_security_hardening.sql')];

// Compare the security inventory against CREATE statements, not a second hand-maintained list.
test('hardening covers every ChatBit table and exact function signature, including history', () => {
  const previous = sources.slice(0, files.indexOf('008_security_hardening.sql')).join('\n');
  const tables = [...previous.matchAll(/CREATE TABLE\s+(\w+)/g)].map(match => match[1]);
  const functions = [...previous.matchAll(/CREATE FUNCTION\s+(\w+\([^)]*\))/g)].map(match => match[1]);
  for (const name of [...tables, 'chatbit_schema_migrations', ...functions]) {
    assert.ok(security.includes(`'${name}'`), `Missing hardening for ${name}`);
  }
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) assert.ok(security.includes(role));
  assert.match(security, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(security, /ALTER DEFAULT PRIVILEGES|GRANT\s|FORCE ROW LEVEL SECURITY/);
});

function migrationPool(failSecurity = false) {
  const commands = [];
  const client = {
    async query(sql, values) {
      commands.push({ sql, values });
      if (failSecurity && sql === security) throw new Error('hardening failed');
      return { rows: [] };
    },
    release() { commands.push({ sql: 'release' }); },
  };
  return { pool: { connect: async () => client }, commands };
}

test('fresh migration executes all eight files and history inserts on one client before one commit', async () => {
  const { pool, commands } = migrationPool();
  assert.deepEqual(await migrate(pool), files);
  assert.equal(commands[0].sql, 'BEGIN');
  assert.deepEqual(commands.filter(command => sources.includes(command.sql)).map(command => command.sql), sources);
  assert.deepEqual(commands.filter(command => command.values).map(command => command.values[0]), files);
  assert.deepEqual(commands.slice(-3).map(command => command.sql), [
    'INSERT INTO chatbit_schema_migrations (name, checksum) VALUES ($1, $2)', 'COMMIT', 'release',
  ]);
  assert.equal(commands.filter(command => command.sql === 'COMMIT').length, 1);
});

test('hardening failure rolls back the entire fresh migration and never commits', async () => {
  const { pool, commands } = migrationPool(true);
  await assert.rejects(migrate(pool), /hardening failed/);
  assert.deepEqual(commands.slice(-2).map(command => command.sql), ['ROLLBACK', 'release']);
  assert.ok(!commands.some(command => command.sql === 'COMMIT'));
  assert.ok(!commands.some(command => command.values?.[0] === '008_security_hardening.sql'));
});
