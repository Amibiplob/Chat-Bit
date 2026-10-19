import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { config } from 'dotenv';
import pg from 'pg';
import { migrationDatabaseConfig } from '../lib/server/database-config.mjs';
import { CHATBIT_TABLES } from './check-database.mjs';

const quote = value => `"${value.replaceAll('"','""')}"`;
// Hash rows in primary-key order without materializing user content in reports.
// Both endpoints must be frozen by the operator; independent snapshots do not
// make a changing source and target mutually consistent.
export async function databaseFingerprint(pool, tables = CHATBIT_TABLES) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL timezone='UTC'");
    await client.query("SET LOCAL datestyle='ISO, YMD'");
    await client.query('SET LOCAL extra_float_digits=3');
    await client.query("SET LOCAL bytea_output='hex'");
    const fingerprints = {};
    for (const table of [...tables].sort()) {
      const primary = await client.query(`SELECT a.attname FROM pg_index i
        JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,position)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
        WHERE n.nspname=current_schema() AND c.relname=$1 AND i.indisprimary ORDER BY k.position`, [table]);
      if (!primary.rows.length) throw new Error('Required table or primary key missing');
      const order = primary.rows.map(row => `t.${quote(row.attname)}`).join(',');
      await client.query(`DECLARE comparison_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS value FROM ${quote(table)} t ORDER BY ${order}`);
      const hash = createHash('sha256'); let count = 0;
      while (true) {
        const page = await client.query('FETCH 500 FROM comparison_rows');
        if (!page.rows.length) break;
        for (const {value} of page.rows) { hash.update(value); hash.update('\n'); count++; }
      }
      await client.query('CLOSE comparison_rows');
      fingerprints[table] = { count, sha256: hash.digest('hex') };
    }
    await client.query('COMMIT');
    return fingerprints;
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  config({path:['.env.local','.env'],quiet:true});
  const pools=[];
  try {
    const snapshots=[];
    for(const name of ['MIGRATION_SOURCE_DATABASE_URL','MIGRATION_TARGET_DATABASE_URL']) {
      const url=process.env[name];
      if(!url)throw new Error('Explicit source and target are required');
      const neon=new URL(url).hostname.endsWith('.neon.tech');
      const pool=new pg.Pool(migrationDatabaseConfig({...process.env,DATABASE_URL:url,DATABASE_MIGRATION_URL:url,...(neon?{DATABASE_SSL_CA:undefined}:{})}));
      pools.push(pool);snapshots.push(await databaseFingerprint(pool));
    }
    if(!isDeepStrictEqual(snapshots[0],snapshots[1]))throw new Error('Database row comparison mismatch');
    console.log(`PASS: ${CHATBIT_TABLES.length} tables match by exact counts and ordered SHA-256 row content. Both endpoints were read-only.`);
  } catch {console.error('Database comparison failed; check frozen source/target, TLS, schemas and preserved rows. No rows, hashes or connection details logged.');process.exitCode=1;}
  finally {await Promise.all(pools.map(pool=>pool.end()));}
}
