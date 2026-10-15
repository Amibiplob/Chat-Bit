import { transaction } from './transaction.mjs';
import { validated, MessagingError, idSchema } from './messaging-validation.mjs';
import { profileSchema, preferencesSchema, passwordSchema, reauthSchema, avatarMime } from './settings-validation.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { normalizeAvatar } from './avatar-image.mjs';
import { createHmac } from 'node:crypto';
export async function settingsRateLimit(pool,userId,operation,secret) {
  const max=operation==='sensitive'?5:operation==='avatar'?10:120;
  const key=createHmac('sha256',secret).update(`settings:${operation}:${userId}`).digest('hex');
  const {rows}=await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute')
    ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$2+1) END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END RETURNING attempts`,[key,max]);
  if(rows[0].attempts>max) throw new MessagingError('Too many settings requests. Try again in a minute.',429);
}
export async function readSettings(pool,userId) {
  const {rows}=await pool.query(`SELECT id,email,display_name AS "displayName",bio,created_at AS "createdAt",avatar_version AS "avatarVersion",
    notify_messages AS "notifyMessages",notify_calls AS "notifyCalls",show_online AS "showOnline",show_last_seen AS "showLastSeen"
    FROM users WHERE id=$1`,[userId]);
  if(!rows.length) throw new MessagingError('Sign in to continue.',401);
  return {...rows[0],createdAt:rows[0].createdAt.toISOString()};
}
export async function updateProfile(pool,userId,input) {
  const v=validated(profileSchema,input);
  await pool.query('UPDATE users SET display_name=$2,bio=$3,updated_at=now() WHERE id=$1',[userId,v.displayName,v.bio]);
  return readSettings(pool,userId);
}
export async function updatePreferences(pool,userId,input) {
  const v=validated(preferencesSchema,input);
  await pool.query(`UPDATE users SET notify_messages=COALESCE($2,notify_messages),notify_calls=COALESCE($3,notify_calls),show_online=COALESCE($4,show_online),show_last_seen=COALESCE($5,show_last_seen),updated_at=now() WHERE id=$1`,[userId,v.notifyMessages??null,v.notifyCalls??null,v.showOnline??null,v.showLastSeen??null]);
  return readSettings(pool,userId);
}
// Verify outside the row lock, then compare the hash under lock. Concurrent
// password changes or revocation cannot authorize a stale credential/session.
async function reauthenticate(pool,userId,input) {
  const v=validated(reauthSchema,input);
  const {rows}=await pool.query('SELECT password_hash FROM users WHERE id=$1',[userId]);
  if(!await verifyPassword(rows[0]?.password_hash,v.currentPassword)) throw new MessagingError('Current password is incorrect.',403);
  return rows[0].password_hash;
}
async function lockAccount(client,userId,session,hash) {
  const {rows}=await client.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[userId]);
  if(rows[0]?.password_hash!==hash) throw new MessagingError('Your account changed. Sign in again.',409);
  const valid=await client.query('SELECT 1 FROM sessions WHERE user_id=$1 AND token_hash=$2 AND expires_at>now()',[userId,session]);
  if(!valid.rowCount) throw new MessagingError('Sign in to continue.',401);
}
export async function changePassword(pool,userId,session,input) {
  const v=validated(passwordSchema,input), hash=await reauthenticate(pool,userId,{currentPassword:v.currentPassword});
  const next=await hashPassword(v.newPassword);
  await transaction(pool,async(client)=> {
    await lockAccount(client,userId,session,hash);
    await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[userId,next]);
    // Invalidate every session, including this browser; require the new password.
    await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
  });
  return {success:true};
}
export async function revokeOtherSessions(pool,userId,session,input) {
  const hash=await reauthenticate(pool,userId,input);
  return transaction(pool,async(client)=> {
    await lockAccount(client,userId,session,hash);
    const result=await client.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[userId,session]);
    return {revoked:result.rowCount};
  });
}
export async function sessionSummary(pool,userId,session) {
  const {rows}=await pool.query(`SELECT created_at AS "createdAt",expires_at AS "expiresAt",token_hash=$2 AS current FROM sessions
    WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 50`,[userId,session]);
  return rows.map(r=>({...r,createdAt:r.createdAt.toISOString(),expiresAt:r.expiresAt.toISOString()}));
}
export async function updateAvatar(pool,userId,bytes) {
  if(bytes) bytes=await normalizeAvatar(bytes);
  const mime=bytes?avatarMime(bytes):null;
  await transaction(pool,async(client)=> {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    if(bytes) await client.query(`INSERT INTO profile_avatars(user_id,content,mime_type) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET content=EXCLUDED.content,mime_type=EXCLUDED.mime_type`,[userId,bytes,mime]);
    else await client.query('DELETE FROM profile_avatars WHERE user_id=$1',[userId]);
    await client.query('UPDATE users SET avatar_version=avatar_version+1,updated_at=now() WHERE id=$1',[userId]);
  });
  return readSettings(pool,userId);
}
export async function readAvatar(pool,actor,target) {
  validated(idSchema,target);
  const {rows}=await pool.query(`SELECT a.content,a.mime_type FROM profile_avatars a WHERE a.user_id=$2 AND
    ($1=$2 OR EXISTS(SELECT 1 FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
      WHERE cm.user_id=$1 AND $2 IN(c.participant_low,c.participant_high)))`,[actor,target]);
  if(!rows.length) throw new MessagingError('Avatar unavailable.',404);
  return rows[0];
}
