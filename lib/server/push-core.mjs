import { createHmac } from 'node:crypto';

/** Explicit opt-in. Never infer activation from a browser flag or supplied URL. */
export function pushConfig(env=process.env){
  if(!env.CHATBIT_REALTIME_PROVIDER)return null;
  if(env.CHATBIT_REALTIME_PROVIDER!=='ably')throw new Error('Realtime configuration unavailable');
  if(!/^[\w-]+\.[\w-]+:[A-Za-z0-9_+/=\-]{16,}$/.test(env.ABLY_API_KEY??''))throw new Error('Realtime configuration unavailable');
  return {key:env.ABLY_API_KEY};
}
/** Opaque per-account invalidation channel, never a conversation or actor ID. */
export function pushChannel(userId,secret){
  return 'chatbit:'+createHmac('sha256',secret).update('push:'+userId).digest('hex');
}
export async function pushToken(config,userId,secret){
  const channel=pushChannel(userId,secret);
  const {Rest}=await import('ably');
  const rest=new Rest({key:config.key,queryTime:false,logLevel:0});
  const tokenRequest=await rest.auth.createTokenRequest({ttl:60000,clientId:channel,capability:JSON.stringify({[channel]:['subscribe']})});
  return {enabled:true,channel,tokenRequest};
}
/** Only empty invalidations cross the provider. The database remains authoritative.
 * Injection is for local transport tests, never an environment-selected endpoint. */
export async function publishHints(config,users,secret,publish){
  const {Rest}=await import('ably');
  const rest=publish?null:new Rest({key:config.key,httpRequestTimeout:2000,httpMaxRetryCount:0,logLevel:0});
  await Promise.all([...new Set(users)].map(userId=>{
    const channel=pushChannel(userId,secret);
    return publish?publish(channel,'invalidate',{v:1}):rest.channels.get(channel).publish('invalidate',{v:1});
  }));
}
