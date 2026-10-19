import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from 'dotenv';
import { databaseConfig, migrationDatabaseConfig } from '../lib/server/database-config.mjs';

export const CHATBIT_TABLES = ['users','sessions','conversations','conversation_members','messages','message_attachments','message_read_states','calls','auth_rate_limits','realtime_revisions','realtime_activity','call_slots','call_signals','profile_avatars','chatbit_schema_migrations'];

// Explicit operator invocation only; both endpoints are inspected read-only.
export async function databaseReadiness(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query('SELECT name, checksum FROM chatbit_schema_migrations ORDER BY name');
    const files = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (rows.length !== files.length) throw new Error('Migration history incomplete');
    for (const [index, name] of files.entries()) {
      const checksum = createHash('sha256').update(await readFile(new URL(`../db/migrations/${name}`, import.meta.url))).digest('hex');
      if (rows[index].name !== name || rows[index].checksum !== checksum) throw new Error('Migration history mismatch');
    }
    // Owner access is required because the existing security model enables RLS
    // without policies; a new non-owner runtime role would see no application rows.
    const tables = CHATBIT_TABLES;
    const result = await client.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
      pg_has_role(current_user,c.relowner,'USAGE') AS owner_access,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND c.relkind='r'`, [tables]);
    if (result.rows.length !== tables.length || result.rows.some(row => !row.relrowsecurity || row.relforcerowsecurity || !row.owner_access || row.public_access)) throw new Error('Table security or runtime ownership mismatch');
    const functions = await client.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=current_schema() AND p.proname=ANY($1::text[]) AND p.pronargs=0
      AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')`,
      [['validate_direct_member','bump_conversation_revision','manage_call_slots','bump_profile_revision']]);
    if (functions.rows.length) throw new Error('Trigger function privileges require hardening');
    await client.query('SELECT 1 FROM users LIMIT 1');
    await client.query('COMMIT');
    return { migrations: files.length, tables: tables.length };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  config({ path: ['.env.local', '.env'], quiet: true });
  try {
    for (const [label, settings] of [['runtime', databaseConfig()], ['migration', migrationDatabaseConfig()]]) {
      const pool = new pg.Pool(settings);
      try { await databaseReadiness(pool); console.log(`${label}: connection, migration history and table security passed (read-only).`); }
      finally { await pool.end(); }
    }
  } catch { console.error('Database readiness failed; check endpoint TLS, migration history, privileges and ownership. No connection details logged.'); process.exitCode = 1; }
}
