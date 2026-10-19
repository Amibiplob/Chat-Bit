import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { attachmentStorageConfiguration, neonStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { createAttachmentStorageClient } from '../lib/server/attachment-storage-client.mjs';
import { attachmentStorage } from '../lib/server/attachment-storage-core.mjs';
import { createNeonClient, neonAttachmentStorage } from '../lib/server/neon-storage.mjs';
import { validateAttachmentContent } from '../lib/server/attachment-validation.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Copies only database-referenced available objects. Never deletes source objects
// or changes database rows. Pre-existing target content must be byte-identical.
export async function migrateAttachmentObjects(rows, source, target, copy = false) {
  const totals = { verified: 0, copied: 0 };
  for await (const row of rows) {
    const bytes = await source.read(row.storageKey);
    validateAttachmentContent(bytes, row.byteSize, row.mimeType, row.filename.split('.').at(-1)?.toLowerCase() ?? '');
    let existing;
    try { existing = await target.read(row.storageKey); }
    catch (error) {
      if (error?.cause?.code !== 'STORAGE_404') throw error;
      if (!copy) throw new Error('Target attachment missing; explicit copy required');
      await target.write(row.storageKey, bytes, row.mimeType);
      existing = await target.read(row.storageKey);
      totals.copied++;
    }
    if (digest(bytes) !== digest(existing)) throw new Error('Target object conflict; no overwrite performed');
    totals.verified++;
  }
  return totals;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  config({ path: ['.env.local', '.env'], quiet: true });
  let pool; let db; let client;
  try {
    const args = process.argv.slice(2);
    if (!args.length || args.some(arg => !['--copy','--verify','--confirm-frozen-target'].includes(arg)) ||
        args.includes('--copy') === args.includes('--verify') || (args.includes('--copy') && !args.includes('--confirm-frozen-target'))) {
      throw new Error('Use --verify or --copy --confirm-frozen-target');
    }
    if (!process.env.MIGRATION_SOURCE_DATABASE_URL) throw new Error('Source URL required');
    pool = new pg.Pool(databaseConfig({ ...process.env, DATABASE_URL: process.env.MIGRATION_SOURCE_DATABASE_URL, max: 1 }));
    db = await pool.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const pending = await db.query("SELECT 1 FROM message_attachments WHERE upload_state='pending' LIMIT 1");
    if (pending.rowCount) throw new Error('Drain pending source uploads before migration');
    await db.query(`DECLARE attachment_copy NO SCROLL CURSOR FOR SELECT storage_key AS "storageKey", byte_size AS "byteSize",mime_type AS "mimeType",filename
      FROM message_attachments WHERE upload_state='available' ORDER BY id`);
    async function* rows() {
      while (true) {
        const page = await db.query('FETCH 100 FROM attachment_copy');
        if (!page.rows.length) break;
        yield* page.rows;
      }
    }
    const sourceConfig = attachmentStorageConfiguration({ ...process.env, ATTACHMENT_STORAGE_PROVIDER: 'supabase' });
    const source = attachmentStorage(createAttachmentStorageClient(sourceConfig), sourceConfig.bucket);
    const targetConfig = neonStorageConfiguration();
    client = createNeonClient(targetConfig);
    const target = neonAttachmentStorage(targetConfig, client);
    const totals = await migrateAttachmentObjects(rows(), source, { read: target.read, write: async (Key, Body, ContentType) => {
      await target.privateBucket();
      await client.send(new PutObjectCommand({ Bucket: targetConfig.bucket, Key, Body, ContentType, CacheControl: 'private, no-store' }), { abortSignal: AbortSignal.timeout(20000) });
    } }, args.includes('--copy'));
    await db.query('COMMIT');
    console.log(`Attachment objects verified: ${totals.verified}; copied: ${totals.copied}. No source objects or database rows changed.`);
  } catch { await db?.query('ROLLBACK').catch(() => {}); console.error('Attachment migration failed. Check explicit mode, frozen targets, source rows, private bucket configuration and object integrity. Values withheld.'); process.exitCode = 1; }
  finally { db?.release(); await pool?.end(); client?.destroy(); }
}
