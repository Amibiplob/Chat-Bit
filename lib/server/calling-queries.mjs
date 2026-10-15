import { createHmac } from 'node:crypto';
import { transaction } from './transaction.mjs';
import { MessagingError, validated, unavailableConversation } from './messaging-validation.mjs';
import { createCallSchema, callSyncSchema, callActionSchema, callSignalSchema, transitionCall, liveStatuses, validateCallId } from './calling-validation.mjs';

export async function callRateLimit(pool, userId, purpose, secret) {
  const max = { create: 10, sync: 120, signal: 300, action: 60, history: 60, ice: 60 }[purpose];
  if (!max) throw new Error('Unknown call rate limit');
  const hash = createHmac('sha256', secret).update(`calling:${purpose}:${userId}`).digest('hex');
  const { rows } = await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '1 minute')
    ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<=now() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,$2+1) END,
    expires_at=CASE WHEN auth_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END RETURNING attempts`, [hash,max]);
  if (rows[0].attempts>max) throw new MessagingError('Too many call requests. Please wait a minute.',429);
}

const selection = `SELECT c.id,c.conversation_id AS "conversationId",c.caller_id AS "callerId",c.callee_id AS "calleeId",
  c.kind,c.status,c.created_at AS "createdAt",c.answered_at AS "answeredAt",c.connected_at AS "connectedAt",c.ended_at AS "endedAt",
  c.ending_reason AS "endingReason",c.caller_tab AS "callerTab",c.callee_tab AS "calleeTab",
  c.caller_session AS "callerSession",c.callee_session AS "calleeSession",c.signal_sequence AS "signalSequence",u.display_name AS name,u.avatar_version AS "avatarVersion"
  FROM calls c JOIN users u ON u.id=CASE WHEN c.caller_id=$1 THEN c.callee_id ELSE c.caller_id END
  JOIN conversation_members cm ON cm.conversation_id=c.conversation_id AND cm.user_id=$1
  WHERE (c.caller_id=$1 OR c.callee_id=$1)`;
function owns(row, userId, session, tabId) {
  return row.callerId===userId ? row.callerTab===tabId && row.callerSession===session : row.calleeTab===tabId && row.calleeSession===session;
}
function dto(row, userId, session, tabId) {
  const data={id:row.id,conversationId:row.conversationId,callerId:row.callerId,calleeId:row.calleeId,
    name:row.name,avatarVersion:row.avatarVersion,kind:row.kind,status:row.status,endingReason:row.endingReason};
  return { ...data, createdAt: row.createdAt.toISOString(), answeredAt: row.answeredAt?.toISOString()??null,
    connectedAt: row.connectedAt?.toISOString()??null, endedAt: row.endedAt?.toISOString()??null,
    duration: row.connectedAt && row.endedAt ? Math.max(0,Math.floor((row.endedAt-row.connectedAt)/1000)) : null,
    owned: owns(row,userId,session,tabId) };
}
async function selected(client,userId,id) {
  const {rows}=await client.query(`${selection} AND c.id=$2 FOR UPDATE OF c`,[userId,id]);
  if (!rows.length) throw unavailableConversation();
  return rows[0];
}

// Each request reconciles only its participant scope. The scheduler sweeps a
// bounded global batch for users who never return after losing their browser.
export async function expireCalls(client, users = null) {
  await client.query(`UPDATE calls SET status=CASE WHEN status='ringing' THEN 'missed' ELSE 'failed' END,
    ended_at=now(),ending_reason=CASE WHEN status='ringing' THEN 'unanswered' ELSE 'connection_expired' END
    WHERE id IN (SELECT c.id FROM calls c WHERE c.ended_at IS NULL
      AND ($1::uuid[] IS NULL OR c.caller_id=ANY($1) OR c.callee_id=ANY($1)) AND (
        (c.status='ringing' AND c.created_at<now()-interval '45 seconds') OR
        (c.status='connecting' AND c.answered_at<now()-interval '45 seconds') OR
        c.caller_seen<now()-interval '35 seconds' OR
        (c.status<>'ringing' AND c.callee_seen<now()-interval '35 seconds') OR
        c.connected_at<now()-interval '55 minutes' OR
        NOT EXISTS(SELECT 1 FROM sessions s WHERE s.token_hash=c.caller_session AND s.user_id=c.caller_id AND s.expires_at>now()) OR
        (c.callee_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.token_hash=c.callee_session AND s.user_id=c.callee_id AND s.expires_at>now()))
      ) ORDER BY c.created_at LIMIT 100 FOR UPDATE SKIP LOCKED)`,[users]);
}
export async function cleanupCalls(pool) {
  await transaction(pool, async (client)=> {
    await expireCalls(client);
    await client.query(`DELETE FROM call_signals WHERE (call_id,sequence) IN
      (SELECT call_id,sequence FROM call_signals WHERE expires_at<=now() ORDER BY expires_at LIMIT 1000)`);
  });
}
export async function createCall(pool,userId,session,input) {
  const value=validated(createCallSchema,input);
  try { return await transaction(pool,async(client)=> {
    const {rows}=await client.query(`SELECT c.participant_low,c.participant_high FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.id=$1 AND cm.user_id=$2 FOR KEY SHARE OF cm`,[value.conversationId,userId]);
    if (!rows.length) throw unavailableConversation();
    const other=rows[0].participant_low===userId?rows[0].participant_high:rows[0].participant_low;
    // Serialize simultaneous calls, including the opposite-direction race.
    await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[userId,other]]);
    await expireCalls(client,[userId,other]);
    const previous=await client.query('SELECT id,conversation_id,kind,caller_tab,caller_session FROM calls WHERE caller_id=$1 AND client_id=$2',[userId,value.clientId]);
    if (previous.rowCount) {
      const p=previous.rows[0];
      if(p.conversation_id!==value.conversationId || p.kind!==value.kind || p.caller_tab!==value.tabId || p.caller_session!==session) throw new MessagingError('This call request was already used.',409);
      return dto(await selected(client,userId,p.id),userId,session,value.tabId);
    }
    const busy=await client.query('SELECT 1 FROM call_slots WHERE user_id=ANY($1::uuid[])',[[userId,other]]);
    if(busy.rowCount) throw new MessagingError('You or the recipient are already in a call.',409);
    const inserted=await client.query(`INSERT INTO calls(conversation_id,caller_id,callee_id,kind,client_id,caller_tab,caller_session,caller_seen)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING id`,[value.conversationId,userId,other,value.kind,value.clientId,value.tabId,session]);
    return dto(await selected(client,userId,inserted.rows[0].id),userId,session,value.tabId);
  }); } catch(error) {
    if(error.code==='23505') throw new MessagingError('You or the recipient are already in a call.',409);
    throw error;
  }
}
export async function syncCalls(pool,userId,session,input) {
  const value=validated(callSyncSchema,input);
  return transaction(pool,async(client)=> {
    await expireCalls(client,[userId]);
    let row;
    if(value.callId) row=await selected(client,userId,value.callId);
    else {
      const result=await client.query(`${selection} AND c.ended_at IS NULL ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE OF c`,[userId]); row=result.rows[0];
    }
    if(!row) return {call:null,signals:[]};
    if(owns(row,userId,session,value.tabId) && liveStatuses.has(row.status)) {
      const column=row.callerId===userId?'caller_seen':'callee_seen';
      await client.query(`UPDATE calls SET ${column}=now() WHERE id=$1`,[row.id]);
    }
    const signals=owns(row,userId,session,value.tabId) && liveStatuses.has(row.status)
      ? (await client.query(`SELECT sequence,kind,payload FROM call_signals WHERE call_id=$1 AND sender_id<>$2
        AND sequence>$3 AND expires_at>now() ORDER BY sequence LIMIT 512`,[row.id,userId,value.after])).rows : [];
    return {call:dto(row,userId,session,value.tabId),signals};
  });
}
export async function actionCall(pool,userId,session,id,input) {
  validateCallId(id); const value=validated(callActionSchema,input);
  return transaction(pool,async(client)=> {
    await expireCalls(client,[userId]);
    const row=await selected(client,userId,id);
    const unclaimedRecipient=row.calleeId===userId && row.status==='ringing' && ['accept','reject','end'].includes(value.action);
    if(!unclaimedRecipient && !owns(row,userId,session,value.tabId)) throw new MessagingError('This call belongs to another tab.',409);
    const status=transitionCall(row,userId,value.action);
    if(status==='active' && row.status!=='active') {
      const answered=await client.query("SELECT 1 FROM call_signals WHERE call_id=$1 AND kind='answer'",[id]);
      if(!answered.rowCount) throw new MessagingError('Negotiation has not completed.',409);
    }
    await client.query(`UPDATE calls SET status=$2,
      answered_at=CASE WHEN $3 AND $2='connecting' THEN COALESCE(answered_at,now()) ELSE answered_at END,
      callee_tab=CASE WHEN $3 THEN $4::uuid ELSE callee_tab END,callee_session=CASE WHEN $3 THEN $5 ELSE callee_session END,
      callee_seen=CASE WHEN $3 THEN now() ELSE callee_seen END,
      connected_at=CASE WHEN $2='active' THEN COALESCE(connected_at,now()) ELSE connected_at END,
      ended_at=CASE WHEN $6 THEN COALESCE(ended_at,now()) ELSE NULL END,
      ending_reason=CASE WHEN $6 THEN COALESCE(ending_reason,$7) ELSE NULL END WHERE id=$1`,
      [id,status,row.status==='ringing' && row.calleeId===userId && ['accept','reject','end'].includes(value.action),value.tabId,session,!liveStatuses.has(status),value.action==='fail'?'connection_failed':status]);
    return dto(await selected(client,userId,id),userId,session,value.tabId);
  });
}
export async function signalCall(pool,userId,session,id,input) {
  validateCallId(id);const value=validated(callSignalSchema,input);
  return transaction(pool,async(client)=> {
    await expireCalls(client,[userId]);const row=await selected(client,userId,id);
    if(!owns(row,userId,session,value.tabId)) throw new MessagingError('This call belongs to another tab.',409);
    if(!['connecting','active'].includes(row.status)) throw new MessagingError('Call signaling is unavailable.',409);
    const {kind,payload}=value.signal;
    const previous=await client.query('SELECT sequence,kind,payload FROM call_signals WHERE call_id=$1 AND sender_id=$2 AND client_id=$3',[id,userId,value.clientId]);
    if(previous.rowCount) {
      const p=previous.rows[0];
      // JSONB ignores key order, so compare through PostgreSQL equality.
      const equal=await client.query('SELECT $1::jsonb=$2::jsonb AS same',[p.payload,payload]);
      if(p.kind!==kind || !equal.rows[0].same) throw new MessagingError('Signal retry does not match.',409);
      return {sequence:p.sequence};
    }
    if((kind==='offer' && row.callerId!==userId)||(kind==='answer' && row.calleeId!==userId)) throw new MessagingError('Invalid description sender.',403);
    if(kind!=='ice') {
      if(row.status!=='connecting') throw new MessagingError('Negotiation is already complete.',409);
      const descriptions=await client.query('SELECT kind FROM call_signals WHERE call_id=$1 AND kind IN (\'offer\',\'answer\')',[id]);
      if(descriptions.rows.some((r)=>r.kind===kind) || (kind==='answer' && !descriptions.rows.some((r)=>r.kind==='offer'))) throw new MessagingError('Invalid negotiation order.',409);
    }
    const count=await client.query("SELECT count(*)::integer AS count FROM call_signals WHERE call_id=$1 AND sender_id=$2 AND kind='ice'",[id,userId]);
    if(row.signalSequence>=512 || (kind==='ice' && count.rows[0].count>=100)) throw new MessagingError('Call signal limit reached.',429);
    const next=row.signalSequence+1;
    await client.query('INSERT INTO call_signals(call_id,sequence,sender_id,client_id,kind,payload) VALUES($1,$2,$3,$4,$5,$6)',[id,next,userId,value.clientId,kind,payload]);
    await client.query('UPDATE calls SET signal_sequence=$2 WHERE id=$1',[id,next]);
    return {sequence:next};
  });
}
export async function callHistory(pool,userId) {
  const {rows}=await pool.query(`${selection} ORDER BY c.created_at DESC,c.id DESC LIMIT 50`,[userId]);
  return rows.map((row)=>dto(row,userId,'',''));
}
export async function authorizeCallIce(pool,userId,session,id,tabId) {
  validateCallId(id); validated(callSyncSchema,{tabId});
  return transaction(pool,async(client)=> {
    await expireCalls(client,[userId]);const row=await selected(client,userId,id);
    if(!owns(row,userId,session,tabId) || !liveStatuses.has(row.status)) throw unavailableConversation();
    return row.id;
  });
}
