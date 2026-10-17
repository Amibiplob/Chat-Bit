import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { migrate } from '../scripts/migrate.mjs';
import { databaseConfig } from '../lib/server/database-config.mjs';
import { cleanupSessions } from '../lib/server/cleanup.mjs';
import { requestRateLimit } from '../lib/server/request-rate-limit.mjs';

test('upgrade from calling milestone preserves accounts; maintenance is bounded, retryable and preserves live records', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test instance',
}, async () => {
  const config=databaseConfig({DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:process.env.TEST_DATABASE_SSL??'verify'});
  const admin=new pg.Pool(config),schema=`chatbit_maintenance_${randomUUID().replaceAll('-','')}`;
  const directory=await mkdtemp(join(tmpdir(),'chatbit-upgrade-'));let pool,created=false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);created=true;
    pool=new pg.Pool({...config,options:`-c search_path=${schema}`});
    const source=new URL('../db/migrations/',import.meta.url);
    for(const name of (await readdir(source)).filter(name=>/^00[1-5]_/.test(name))) await copyFile(new URL(name,source),join(directory,name));
    assert.equal((await migrate(pool,pathToFileURL(`${directory}/`))).length,5);
    const user=randomUUID(),token='a'.repeat(64);
    await pool.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,'upgrade@example.com','Retained','$argon2id$fixture')",[user]);
    assert.deepEqual(await migrate(pool),['006_settings.sql','007_maintenance.sql','008_security_hardening.sql']);
    assert.deepEqual(await migrate(pool),[]);
    assert.equal((await pool.query('SELECT display_name,show_online FROM users WHERE id=$1',[user])).rows[0].display_name,'Retained');
    await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[token,user]);
    await pool.query(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at)
      SELECT md5(i::text)||md5('session'||i),$1,now()-interval '2 days',now()-interval '1 day' FROM generate_series(1,501) i`,[user]);
    const old=randomUUID(),recent=randomUUID(),live=randomUUID();
    for(const [tab,expiry] of [[old,'-2 minutes'],[recent,'-30 seconds'],[live,'25 seconds']]) {
      await pool.query(`INSERT INTO realtime_activity(session_hash,tab_id,user_id,sequence,expires_at)
        VALUES($1,$2,$3,1,now()+$4::interval)`,[token,tab,user,expiry]);
    }
    await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
      SELECT md5(i::text)||md5('rate'||i),1,now()-interval '1 day' FROM generate_series(1,501) i`);
    await cleanupSessions(pool);
    assert.equal((await pool.query('SELECT count(*) FROM sessions')).rows[0].count,'2');
    assert.equal((await pool.query('SELECT count(*) FROM auth_rate_limits')).rows[0].count,'1');
    assert.equal((await pool.query('SELECT count(*) FROM realtime_activity WHERE tab_id=$1',[old])).rows[0].count,'0');
    assert.equal((await pool.query('SELECT count(*) FROM realtime_activity')).rows[0].count,'2');
    await Promise.all([cleanupSessions(pool),cleanupSessions(pool)]);
    assert.equal((await pool.query('SELECT token_hash FROM sessions')).rows[0].token_hash,token);
    assert.equal((await pool.query('SELECT count(*) FROM auth_rate_limits')).rows[0].count,'0');
    assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'1');
    const attempts=await Promise.allSettled(Array.from({length:8},()=>requestRateLimit(pool,user,'test',3,'dedicated-test-secret')));
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,3);
    for(const result of attempts.filter(result=>result.status==='rejected')) assert.equal(result.reason.status,429);
    await requestRateLimit(pool,randomUUID(),'test',3,'dedicated-test-secret');
  } finally {
    await pool?.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
    await rm(directory,{recursive:true,force:true});
  }
});
