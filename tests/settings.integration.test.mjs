import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {databaseConfig} from '../lib/server/database-config.mjs';
import {migrate} from '../scripts/migrate.mjs';
import {loginAccount} from '../lib/server/auth-service.mjs';
import {hashPassword,verifyPassword} from '../lib/server/passwords.mjs';
import {sessionHash} from '../lib/server/session-core.mjs';
import {createConversation,listConversations} from '../lib/server/messaging-queries.mjs';
import {synchronize,updateActivity} from '../lib/server/realtime-queries.mjs';
import * as settings from '../lib/server/settings-queries.mjs';
test('profile, private avatars, preferences and password/session lifecycle in isolated PostgreSQL',{
  skip:!process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated PostgreSQL test instance',
},async(t)=>{
  const config=databaseConfig({DATABASE_URL:process.env.TEST_DATABASE_URL,DATABASE_SSL:process.env.TEST_DATABASE_SSL??'verify'}),admin=new pg.Pool(config);
  const schema='chatbit_settings_'+randomUUID().replaceAll('-','');let pool,created=false;
  const [a,b,c]=[randomUUID(),randomUUID(),randomUUID()],token=randomBytes(32).toString('base64url'),session=sessionHash(token),second='b'.repeat(64),third='c'.repeat(64);
  const password='old secret passphrase',next='new secret passphrase';
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);created=true;pool=new pg.Pool({...config,options:`-c search_path=${schema}`});await migrate(pool);
    const hash=await hashPassword(password);
    for(const [i,id] of [a,b,c].entries()) await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`settings${i}@example.com`,`User ${i}`,hash]);
    for(const [user,hash] of [[a,session],[a,second],[b,third]]) await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hash,user]);
    const conversation=await createConversation(pool,a,{participantId:b});
    await t.test('profile update is scoped and invalidates conversation snapshots',async()=>{
      const before=await synchronize(pool,b,{conversationId:null,revision:null,force:true});
      await settings.updateProfile(pool,a,{displayName:'Updated name',bio:'Private biography'});
      const mine=await settings.readSettings(pool,a);assert.equal(mine.displayName,'Updated name');assert.equal(mine.bio,'Private biography');assert.ok(mine.createdAt);
      assert.equal((await settings.readSettings(pool,b)).displayName,'User 1');
      assert.equal((await listConversations(pool,b))[0].name,'Updated name');
      const after=await synchronize(pool,b,{conversationId:null,revision:before.revision});assert.ok(after.conversations);
      assert.ok(!JSON.stringify(after).includes('Private biography'));assert.ok(!JSON.stringify(after).includes('settings0@example.com'));
      await assert.rejects(settings.updateProfile(pool,a,{displayName:'Injected',bio:'',userId:b}));
    });
    await t.test('avatar owner and conversation partners can read; outsiders cannot',async()=>{
      const png=await sharp({create:{width:2,height:2,channels:3,background:'#336699'}}).png().toBuffer();
      await settings.updateAvatar(pool,a,png);assert.equal((await settings.readAvatar(pool,b,a)).mime_type,'image/png');
      await assert.rejects(settings.readAvatar(pool,c,a),{status:404});await assert.rejects(settings.readAvatar(pool,a,'invalid'));
      assert.equal((await listConversations(pool,b))[0].avatarVersion,1);
      await settings.updateAvatar(pool,a,null);await assert.rejects(settings.readAvatar(pool,b,a),{status:404});
    });
    await t.test('preferences persist and privacy hides presence at the server boundary',async()=>{
      const prefs={notifyMessages:false,notifyCalls:false,showOnline:false,showLastSeen:false};await settings.updatePreferences(pool,a,prefs);
      const mine=await settings.readSettings(pool,a);for(const key of Object.keys(prefs)) assert.equal(mine[key],false);
      await updateActivity(pool,a,token,{tabId:randomUUID(),sequence:1,conversationId:conversation,typing:false});
      const snapshot=await synchronize(pool,b,{conversationId:conversation,revision:null,force:true});assert.equal(snapshot.presence.online,false);assert.equal(snapshot.presence.lastSeen,null);
      assert.equal((await settings.readSettings(pool,b)).showOnline,true);
      await settings.updatePreferences(pool,a,{notifyMessages:true});
      const updated=await settings.readSettings(pool,a);
      assert.equal(updated.notifyMessages,true);assert.equal(updated.notifyCalls,false);
      assert.equal(updated.showOnline,false);assert.equal(updated.showLastSeen,false);
    });
    await t.test('reauthentication and actor session are required to revoke other sessions',async()=>{
      await assert.rejects(settings.revokeOtherSessions(pool,a,session,{currentPassword:'wrong'}),{status:403});
      await assert.rejects(settings.revokeOtherSessions(pool,a,third,{currentPassword:password}),{status:401});
      assert.equal((await settings.revokeOtherSessions(pool,a,session,{currentPassword:password})).revoked,1);
      const summary=await settings.sessionSummary(pool,a,session);assert.equal(summary.length,1);assert.equal(summary[0].current,true);assert.ok(!JSON.stringify(summary).includes(session));
      assert.equal((await pool.query('SELECT count(*) FROM sessions WHERE user_id=$1',[b])).rows[0].count,'1');
    });
    await t.test('password change requires current password, hashes replacement and revokes all own sessions',async()=>{
      const input={currentPassword:password,newPassword:next,confirmPassword:next};
      await assert.rejects(settings.changePassword(pool,a,session,{...input,currentPassword:'wrong'}),{status:403});
      const race=await Promise.allSettled([settings.changePassword(pool,a,session,input),loginAccount(pool,{email:'settings0@example.com',password},{clientId:randomUUID(),secret:'isolated-settings-rate-limit-secret'})]);
      assert.equal(race[0].status,'fulfilled');
      const {rows}=await pool.query('SELECT password_hash FROM users WHERE id=$1',[a]);assert.ok(await verifyPassword(rows[0].password_hash,next));assert.equal(await verifyPassword(rows[0].password_hash,password),false);
      assert.equal((await pool.query('SELECT count(*) FROM sessions WHERE user_id=$1',[a])).rows[0].count,'0');
      assert.equal((await pool.query('SELECT count(*) FROM sessions WHERE user_id=$1',[b])).rows[0].count,'1');
    });
  }finally{await pool?.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
