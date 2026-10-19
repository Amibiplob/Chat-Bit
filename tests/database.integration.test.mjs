import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { transaction } from '../lib/server/transaction.mjs';
import { getMessagePage } from '../lib/server/messaging-queries.mjs';
import { attachmentForDownload } from '../lib/server/attachment-queries.mjs';
import { migrate } from '../scripts/migrate.mjs';

test('PostgreSQL migrations, constraints, transactions and private data access', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL tests',
}, async (t) => {
  const settings = databaseConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: process.env.TEST_DATABASE_SSL ?? 'verify' });
  const schema = `chatbit_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool(settings);
  let pool;
  let schemaCreated = false;
  try {
    // Generated schema identifier contains only letters, numbers and underscores.
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    pool = new pg.Pool({ ...settings, options: `-c search_path=${schema}` });
    const migrationDirectory = new URL('../db/migrations/', import.meta.url);
    const migrationFiles = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql'));
    async function copyMigrations(directory) {
      for (const name of migrationFiles) await writeFile(join(directory, name), await readFile(new URL(name, migrationDirectory)));
    }
    await t.test('migration applies once and concurrent runs are serialized', async () => {
      const outcomes = await Promise.all([migrate(pool), migrate(pool)]);
      assert.equal(outcomes.flat().length, migrationFiles.length);
      assert.deepEqual(await migrate(pool), []);
      assert.equal((await pool.query('SELECT count(*) FROM chatbit_schema_migrations')).rows[0].count, String(migrationFiles.length));
    });
    await t.test('migration checksum detects edited files', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'chatbit-migrations-'));
      try {
        await copyMigrations(directory);
        const sql = await readFile(new URL('../db/migrations/001_initial.sql', import.meta.url), 'utf8');
        await writeFile(join(directory, '001_initial.sql'), `${sql}\n-- changed`);
        await assert.rejects(migrate(pool, pathToFileURL(`${directory}/`)), /modified/);
      } finally { await rm(directory, { recursive: true }); }
    });
    await t.test('failed migrations rollback both DDL and migration records', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'chatbit-migrations-'));
      try {
        await copyMigrations(directory);
        await writeFile(join(directory, '999_failure.sql'), 'CREATE TABLE rollback_probe (id integer); SELECT * FROM nonexistent_probe;');
        await assert.rejects(migrate(pool, pathToFileURL(`${directory}/`)), { code: '42P01' });
        assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS table_name")).rows[0].table_name, null);
        assert.equal((await pool.query('SELECT count(*) FROM chatbit_schema_migrations')).rows[0].count, String(migrationFiles.length));
      } finally { await rm(directory, { recursive: true }); }
    });
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const [index, id] of [a, b, c].entries()) {
      await pool.query('INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)',
        [id, `test${index}@example.com`, '$argon2id$fixture', `User ${index}`]);
    }
    const conversation = randomUUID();
    const other = randomUUID();
    await pool.query('INSERT INTO conversations (id,participant_low,participant_high) VALUES ($1,$2,$3),($4,$2,$5)', [conversation, a, b, other, c]);
    await pool.query('INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3),($4,$2),($4,$5)', [conversation, a, b, other, c]);
    const message = randomUUID();
    const attachment = randomUUID();
    const clientId = randomUUID();
    await pool.query('INSERT INTO messages (id,conversation_id,sender_id,client_id,body) VALUES ($1,$2,$3,$4,$5)', [message, conversation, a, clientId, "hello '); DROP TABLE users; --"]);
    await pool.query('INSERT INTO message_attachments (id,conversation_id,message_id,uploader_id,storage_key,filename,mime_type,byte_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [attachment, conversation, message, a, 'private/random-key', 'test.pdf', 'application/pdf', 100]);
    await t.test('members can read messages and files; unrelated users cannot', async () => {
      assert.equal((await getMessagePage(pool,b,conversation)).messages[0].id,message);
      await assert.rejects(getMessagePage(pool,c,conversation),{status:404});
      assert.equal((await attachmentForDownload(pool,b,attachment)).filename,'test.pdf');
      await assert.rejects(attachmentForDownload(pool,c,attachment),{status:404});
      assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count, '3');
    });
    await t.test('database rejects outsiders, duplicate sends and cross-conversation references', async () => {
      await assert.rejects(pool.query('INSERT INTO conversation_members VALUES ($1,$2,now())', [conversation, c]), { code: '23514' });
      await assert.rejects(pool.query('INSERT INTO conversations (participant_low,participant_high) VALUES ($1,$2)', [a, b]), { code: '23505' });
      await assert.rejects(pool.query('INSERT INTO messages (conversation_id,sender_id,client_id,body) VALUES ($1,$2,$3,$4)', [conversation, c, randomUUID(), 'outsider']), { code: '23503' });
      await assert.rejects(pool.query('INSERT INTO messages (conversation_id,sender_id,client_id,body) VALUES ($1,$2,$3,$4)', [conversation, a, clientId, 'duplicate']), { code: '23505' });
      await assert.rejects(pool.query('INSERT INTO messages (conversation_id,sender_id,client_id,body,reply_to_id) VALUES ($1,$2,$3,$4,$5)', [other, a, randomUUID(), 'reply', message]), { code: '23503' });
      await assert.rejects(pool.query('INSERT INTO message_read_states VALUES ($1,$2,$3,now())', [conversation, message, c]), { code: '23503' });
      await assert.rejects(pool.query('INSERT INTO calls (conversation_id,caller_id,callee_id,kind,caller_tab,caller_session,caller_seen) VALUES ($1,$2,$3,$4,$5,$6,now())', [conversation, a, c, 'voice', randomUUID(), 'test-session-hash']), { code: '23503' });
    });
    await t.test('invalid attachment metadata and empty messages are rejected', async () => {
      await assert.rejects(pool.query('INSERT INTO messages (conversation_id,sender_id,client_id,body) VALUES ($1,$2,$3,$4)', [conversation, a, randomUUID(), '  ']), { code: '23514' });
      for (const [mime, size] of [['text/html', 100], ['application/pdf', 10485761]]) {
        await assert.rejects(pool.query('INSERT INTO message_attachments (conversation_id,message_id,uploader_id,storage_key,filename,mime_type,byte_size) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [conversation, message, a, randomUUID(), 'unsafe', mime, size]), { code: '23514' });
      }
    });
    await t.test('transaction failure does not persist partial writes', async () => {
      await assert.rejects(transaction(pool, async (client) => {
        await client.query('UPDATE users SET bio=$1 WHERE id=$2', ['must rollback', a]);
        throw new Error('abort');
      }), /abort/);
      assert.equal((await pool.query('SELECT bio FROM users WHERE id=$1', [a])).rows[0].bio, '');
    });
    await t.test('soft-deleted message body and attachment are inaccessible', async () => {
      await pool.query('UPDATE messages SET deleted_at=now() WHERE id=$1', [message]);
      const deleted=(await getMessagePage(pool,b,conversation)).messages[0];
      assert.equal(deleted.content,'');assert.equal(deleted.deleted,true);assert.deepEqual(deleted.attachments,[]);
      await assert.rejects(attachmentForDownload(pool,b,attachment),{status:404});
    });
  } finally {
    await pool?.end();
    // Cleanup only this test's newly created schema, never application tables.
    try {
      if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await admin.end(); }
  }
});
