import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { registerAccount, loginAccount } from '../lib/server/auth-service.mjs';
import { resolveSession, revokeSession } from '../lib/server/session-core.mjs';
import * as attachments from '../lib/server/attachment-queries.mjs';

const testURL = process.env.TEST_SECURITY_DATABASE_URL;
const roles = ['anon', 'authenticated', 'service_role', 'chatbit_public_probe'];

test('isolated PostgreSQL client grants: atomic hardening, API denial, owner triggers and rollback', {
  skip: !testURL && 'Requires disposable loopback TEST_SECURITY_DATABASE_URL and tests/fixtures/security.sql',
}, async (t) => {
  // This suite changes fixture ACLs; never accept a hosted database or load .env.
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(testURL).hostname), 'Security tests require a disposable local database');
  const settings = databaseConfig({ DATABASE_URL: testURL, DATABASE_SSL: process.env.TEST_SECURITY_DATABASE_SSL ?? 'verify' });
  const admin = new pg.Pool(settings);
  const schema = `chatbit_security_${randomUUID().replaceAll('-', '')}`;
  let pool;
  let created = false;
  const directory = new URL('../db/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  const sources = await Promise.all(files.map(name => readFile(new URL(name, directory), 'utf8')));
  const security = sources[files.indexOf('008_security_hardening.sql')];
  const tableNames = [...sources.join('\n').matchAll(/CREATE TABLE\s+(\w+)/g)].map(match => match[1]).concat('chatbit_schema_migrations');
  const signatures = [...sources.join('\n').matchAll(/CREATE FUNCTION\s+(\w+\([^)]*\))/g)].map(match => match[1]);
  async function unrelatedSnapshot() {
    return (await admin.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relrowsecurity,
      (SELECT count(*) FROM unrelated_auth.security_sentinel) AS auth_rows,
      (SELECT count(*) FROM unrelated_files.security_sentinel) AS storage_rows,
      (SELECT count(*) FROM unrelated_events.security_sentinel) AS realtime_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('unrelated_auth','unrelated_files','unrelated_events') AND c.relname='security_sentinel' ORDER BY 1`)).rows;
  }
  try {
    assert.equal(Math.floor(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 17,
      'Security verification requires PostgreSQL 17');
    const fixtureRoles = (await admin.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [[...roles, 'chatbit_security_owner']])).rows;
    assert.equal(fixtureRoles.length, 5, 'Load the isolated security fixture first');
    const before = await unrelatedSnapshot();
    assert.equal(before.length, 3);
    await admin.query(`CREATE SCHEMA ${schema} AUTHORIZATION chatbit_security_owner`);
    created = true;
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO anon,authenticated,service_role,chatbit_public_probe`);
    // Deliberately reproduce broad client grants plus PUBLIC table access.
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE chatbit_security_owner IN SCHEMA ${schema}
      GRANT ALL ON TABLES TO PUBLIC,anon,authenticated,service_role`);
    await admin.query(`ALTER DEFAULT PRIVILEGES FOR ROLE chatbit_security_owner IN SCHEMA ${schema}
      GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role`);
    pool = new pg.Pool({ ...settings, options: `-c role=chatbit_security_owner -c search_path=${schema}` });
    const defaultSnapshot = await admin.query(`SELECT defaclobjtype,defaclacl::text FROM pg_default_acl WHERE defaclnamespace=$1::regnamespace ORDER BY 1`, [schema]);

    await t.test('objects remain invisible until hardening has finished; owner is not superuser', async () => {
      let checkedBeforeCommit = false;
      const wrapped = { async connect() {
        const client = await pool.connect();
        return {
          release: discard => client.release(discard),
          async query(sql, params) {
            const result = await client.query(sql, params);
            if (sql === security) {
              assert.equal((await client.query('SELECT count(*) FROM chatbit_schema_migrations')).rows[0].count, '7');
              assert.equal((await client.query(`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`)).rows[0].rolsuper, false);
              assert.equal((await admin.query('SELECT to_regclass($1) AS relation', [`${schema}.users`])).rows[0].relation, null);
              checkedBeforeCommit = true;
            }
            return result;
          },
        };
      } };
      assert.deepEqual(await migrate(wrapped), files);
      assert.equal(checkedBeforeCommit, true);
      assert.deepEqual(await migrate(pool), []);
    });

    await t.test('migration history checksums and complete table, function and index inventory exist', async () => {
      const history = (await pool.query('SELECT name, checksum, applied_at FROM chatbit_schema_migrations ORDER BY name')).rows;
      assert.deepEqual(history.map(({ name, checksum }) => ({ name, checksum })), files.map((name, index) => ({
        name, checksum: createHash('sha256').update(sources[index]).digest('hex'),
      })));
      assert.ok(history.every(row => row.applied_at instanceof Date));
      const tables = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename`, [schema])).rows;
      assert.deepEqual(tables.map(row => row.tablename), [...tableNames].sort());
      const indexes = [...new Set([...sources.join('\n').matchAll(/CREATE (?:UNIQUE )?INDEX\s+(\w+)/g)].map(match => match[1]))];
      for (const name of indexes) {
        const result = await pool.query(`SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2`, [schema, name]);
        assert.equal(result.rows[0]?.indisvalid, true, name);
      }
      for (const signature of signatures) {
        assert.ok((await pool.query('SELECT to_regprocedure($1) AS function', [`${schema}.${signature}`])).rows[0].function);
      }
      assert.equal((await pool.query('SELECT count(*) FROM pg_policies WHERE schemaname=$1', [schema])).rows[0].count, '0');
    });

    await t.test('all tables have RLS and no effective API, PUBLIC or column grants', async () => {
      for (const table of tableNames) {
        const relation = `${schema}.${table}`;
        const state = (await admin.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, [relation])).rows[0];
        assert.deepEqual(state, { relrowsecurity: true, relforcerowsecurity: false });
        for (const role of roles) {
          const privileges = (await admin.query(`SELECT
            has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,
            has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access`, [role, relation])).rows[0];
          assert.deepEqual(privileges, { table_access: false, column_access: false }, `${role}: ${relation}`);
        }
        const acl = await admin.query(`SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=$1::regclass AND a.grantee=0`, [relation]);
        assert.equal(acl.rowCount, 0, `PUBLIC ACL: ${relation}`);
      }
      for (const signature of signatures) {
        for (const role of roles) {
          assert.equal((await admin.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, `${schema}.${signature}`])).rows[0].allowed, false);
        }
      }
    });

    await t.test('API roles cannot SELECT or TRUNCATE even with service_role BYPASSRLS', async () => {
      for (const role of roles) {
        const client = await admin.connect();
        try {
          await client.query(`SET ROLE ${role}`);
          for (const table of tableNames) {
            await assert.rejects(client.query(`SELECT * FROM ${schema}.${table} LIMIT 0`), { code: '42501' });
            await assert.rejects(client.query(`TRUNCATE ${schema}.${table}`), { code: '42501' });
          }
        } finally { await client.query('RESET ROLE'); client.release(); }
      }
    });

    await t.test('owning server role retains writes and all four trigger functions work', async () => {
      const [a, b] = [randomUUID(), randomUUID()].sort();
      for (const [index, id] of [a, b].entries()) await pool.query(`INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,'$argon2id$fixture','Fixture')`, [id, `security${index}@example.com`]);
      const conversation = (await pool.query('INSERT INTO conversations(participant_low,participant_high) VALUES($1,$2) RETURNING id', [a,b])).rows[0].id;
      await pool.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)', [conversation,a,b]);
      await pool.query(`INSERT INTO messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,'private')`, [conversation,a,randomUUID()]);
      await pool.query(`UPDATE users SET display_name='Changed' WHERE id=$1`, [a]);
      const call = (await pool.query(`INSERT INTO calls(conversation_id,caller_id,callee_id,kind,caller_tab,caller_session,caller_seen)
        VALUES($1,$2,$3,'voice',$4,'fixture',now()) RETURNING id`, [conversation,a,b,randomUUID()])).rows[0].id;
      assert.equal((await pool.query('SELECT count(*) FROM call_slots')).rows[0].count, '2');
      await pool.query(`UPDATE calls SET status='ended',ended_at=now() WHERE id=$1`, [call]);
      assert.equal((await pool.query('SELECT count(*) FROM call_slots')).rows[0].count, '0');
      assert.equal((await pool.query('SELECT count(*) FROM messages')).rows[0].count, '1');
      assert.ok((await pool.query('SELECT revision FROM realtime_revisions WHERE user_id=$1', [a])).rows[0].revision > 0);
    });

    await t.test('managed schemas and default ACLs remain unchanged', async () => {
      assert.deepEqual(await unrelatedSnapshot(), before);
      assert.deepEqual((await admin.query(`SELECT defaclobjtype,defaclacl::text FROM pg_default_acl WHERE defaclnamespace=$1::regnamespace ORDER BY 1`, [schema])).rows, defaultSnapshot.rows);
    });

    await t.test('owning server role supports real authentication, sessions and attachment queries', async () => {
      const context = { clientId: randomUUID(), secret: 'isolated-security-test-rate-limit-secret' };
      const input = { name: 'Security Owner', email: 'owner@example.com', password: 'isolated test passphrase 123' };
      const registered = await registerAccount(pool, input, context);
      const user = await resolveSession(pool, registered.token);
      assert.equal(user.email, input.email);
      const loggedIn = await loginAccount(pool, input, { ...context, previousToken: registered.token });
      assert.equal(await resolveSession(pool, registered.token), null);
      assert.equal((await resolveSession(pool, loggedIn.token)).id, user.id);
      await revokeSession(pool, loggedIn.token);
      assert.equal(await resolveSession(pool, loggedIn.token), null);
      const conversation = (await pool.query('SELECT id, participant_low, participant_high FROM conversations LIMIT 1')).rows[0];
      const reserved = await attachments.reserveAttachment(pool, conversation.participant_low, conversation.id,
        { filename: 'private.txt', mimeType: 'text/plain', byteSize: 12 });
      await attachments.finalizeAttachment(pool, conversation.participant_low, conversation.id, reserved.id,
        { clientId: randomUUID(), caption: 'Owner attachment' });
      assert.equal((await attachments.attachmentForDownload(pool, conversation.participant_high, reserved.id)).filename, 'private.txt');
      await attachments.scheduleAttachmentDeletion(pool, conversation.participant_low, conversation.id, reserved.id);
      await assert.rejects(attachments.attachmentForDownload(pool, conversation.participant_high, reserved.id), { status: 404 });
    });

    await t.test('security failure rolls back fresh DDL and history in PostgreSQL', async () => {
      const failedSchema = `${schema}_rollback`;
      const temp = await mkdtemp(join(tmpdir(), 'chatbit-security-'));
      let failedPool;
      try {
        await admin.query(`CREATE SCHEMA ${failedSchema} AUTHORIZATION chatbit_security_owner`);
        failedPool = new pg.Pool({ ...settings, options: `-c role=chatbit_security_owner -c search_path=${failedSchema}` });
        for (const [index, name] of files.entries()) await writeFile(join(temp,name), sources[index] + (name.startsWith('008_') ? '\nSELECT * FROM missing_security_probe;' : ''));
        await assert.rejects(migrate(failedPool, pathToFileURL(`${temp}/`)), { code: '42P01' });
        assert.equal((await admin.query('SELECT to_regclass($1) AS relation', [`${failedSchema}.chatbit_schema_migrations`])).rows[0].relation, null);
        assert.equal((await admin.query('SELECT to_regclass($1) AS relation', [`${failedSchema}.users`])).rows[0].relation, null);
      } finally {
        await failedPool?.end();
        await admin.query(`DROP SCHEMA IF EXISTS ${failedSchema} CASCADE`);
        await rm(temp, { recursive: true, force: true });
      }
    });
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
