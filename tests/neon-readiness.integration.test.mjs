import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { databaseReadiness, CHATBIT_TABLES } from '../scripts/check-database.mjs';
import * as files from '../lib/server/attachment-queries.mjs';
import { createConversation } from '../lib/server/messaging-queries.mjs';

test('Neon preparation: readiness, sealed completion and staging cleanup in isolated PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a disposable PostgreSQL instance',
}, async t => {
  const settings=databaseConfig({DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:process.env.TEST_DATABASE_SSL??'verify'});
  const schema=`chatbit_neon_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool(settings);let pool;let created=false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);created=true;
    pool=new pg.Pool({...settings,options:`-c search_path=${schema}`});
    await migrate(pool);
    await t.test('readiness checks migrations and privileges read-only and detects PUBLIC drift',async()=>{
      assert.deepEqual(await databaseReadiness(pool),{migrations:8,tables:CHATBIT_TABLES.length});
      await pool.query('GRANT SELECT ON users TO PUBLIC');
      await assert.rejects(databaseReadiness(pool),/security/);
      await pool.query('REVOKE SELECT ON users FROM PUBLIC');
      await pool.query('GRANT EXECUTE ON FUNCTION validate_direct_member() TO PUBLIC');
      await assert.rejects(databaseReadiness(pool),/privileges/);
      await pool.query('REVOKE EXECUTE ON FUNCTION validate_direct_member() FROM PUBLIC');
      await pool.query('ALTER FUNCTION validate_direct_member() RENAME TO renamed_trigger');
      await assert.rejects(databaseReadiness(pool),/privileges/);
      await pool.query('ALTER FUNCTION renamed_trigger() RENAME TO validate_direct_member');
    });
    const [a,b]=[randomUUID(),randomUUID()].sort();
    for(const [i,id] of [a,b].entries())await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`neon${i}@example.com`,`Neon ${i}`,'$argon2id$synthetic']);
    const conversation=await createConversation(pool,a,{participantId:b});
    let reservation;let key;
    await t.test('concurrent sealed completion records exactly one key and schedules staging pruning',async()=>{
      reservation=await files.reserveAttachment(pool,a,conversation,{filename:'test.txt',mimeType:'text/plain',byteSize:5});
      key=`${reservation.key}.sealed/${'a'.repeat(64)}`;
      const input={clientId:randomUUID(),caption:''};
      const ids=await Promise.all([files.finalizeAttachment(pool,a,conversation,reservation.id,input,key),files.finalizeAttachment(pool,a,conversation,reservation.id,input,`${reservation.key}.sealed/${'b'.repeat(64)}`)]);
      assert.equal(ids[0],ids[1]);
      const row=(await pool.query('SELECT storage_key,cleanup_after,upload_state FROM message_attachments WHERE id=$1',[reservation.id])).rows[0];
      assert.ok([key,`${reservation.key}.sealed/${'b'.repeat(64)}`].includes(row.storage_key));key=row.storage_key;assert.ok(row.cleanup_after>new Date());assert.equal(row.upload_state,'available');
      assert.equal((await files.attachmentForDownload(pool,b,reservation.id)).storageKey,key);
      await assert.rejects(files.attachmentForDownload(pool,randomUUID(),reservation.id),{status:404});
      await pool.query("UPDATE message_attachments SET cleanup_after=now()-interval '1 minute' WHERE id=$1",[reservation.id]);
      assert.equal((await files.cleanupCandidates(pool)).find(row=>row.id===reservation.id).uploadState,'available');
    });
    await t.test('late prune acknowledgement cannot mark concurrent deletion complete',async()=>{
      await files.scheduleAttachmentDeletion(pool,a,conversation,reservation.id);
      await files.recordCleanup(pool,[reservation.id],true,true);
      const row=(await pool.query('SELECT upload_state,cleanup_after FROM message_attachments WHERE id=$1',[reservation.id])).rows[0];
      assert.equal(row.upload_state,'delete_pending');assert.ok(row.cleanup_after);
      await assert.rejects(files.attachmentForDownload(pool,b,reservation.id),{status:404});
    });

  } finally {await pool?.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
