import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from 'dotenv';
import { migrationDatabaseConfig } from '../lib/server/database-config.mjs';
import { transaction } from '../lib/server/transaction.mjs';

export async function migrate(pool, directory = new URL('../db/migrations/', import.meta.url)) {
  const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  return transaction(pool, async (client) => {
    // Serialize concurrent deployment migration runs; lock releases on commit/rollback.
    await client.query('SELECT pg_advisory_xact_lock(72618423)');
    await client.query(`CREATE TABLE IF NOT EXISTS chatbit_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT name, checksum FROM chatbit_schema_migrations');
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));
    for (const name of applied.keys()) {
      if (!files.includes(name)) throw new Error('An applied migration file is missing');
    }
    const completed = [];
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error('An applied migration was modified');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO chatbit_schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      completed.push(name);
    }
    return completed;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  config({ path: ['.env.local', '.env'], quiet: true });
  let pool;
  try {
    pool = new pg.Pool(migrationDatabaseConfig());
    const completed = await migrate(pool);
    console.log(completed.length ? `Applied: ${completed.join(', ')}` : 'Database is up to date');
  } catch {
    console.error('Migration failed. Check connectivity, database permissions, and migration integrity. No connection details are logged.');
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
