import { createHmac } from 'node:crypto';
import { z } from 'zod';
const urls = (value, fallback, pattern) => {
  const result=z.array(z.string().max(512).regex(pattern)).max(8).parse(value ? JSON.parse(value) : fallback);
  return result;
};
export function callIceConfiguration(env, userId, callId, now = Date.now()) {
  const stun=urls(env.CALL_STUN_URLS,['stun:stun.l.google.com:19302'],/^stuns?:[^\s@]+$/);
  const turn=urls(env.CALL_TURN_URLS,[],/^turns?:[^\s@]+$/);
  const iceServers=stun.length?[{urls:stun}]:[];
  if(turn.length) {
    if(!env.CALL_TURN_SHARED_SECRET || env.CALL_TURN_SHARED_SECRET.length<32) throw new Error('TURN shared secret must contain at least 32 characters.');
    const username=`${Math.floor(now/1000)+3600}:${userId}:${callId}`;
    iceServers.push({urls:turn,username,credential:createHmac('sha1',env.CALL_TURN_SHARED_SECRET).update(username).digest('base64')});
  }
  if(env.CALL_RELAY_ONLY==='1' && !turn.length) throw new Error('Relay-only calling requires TURN.');
  return {iceServers,iceTransportPolicy:env.CALL_RELAY_ONLY==='1'?'relay':'all'};
}
