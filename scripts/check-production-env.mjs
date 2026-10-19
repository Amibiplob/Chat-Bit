import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { databaseConfig, migrationDatabaseConfig } from '../lib/server/database-config.mjs';
import { attachmentStorageConfiguration } from '../lib/server/attachment-storage-config.mjs';
import { callIceConfiguration } from '../lib/server/calling-ice.mjs';
import { rateLimitSecret } from '../lib/server/auth-request.mjs';

// Validate configuration shape only. Never connect, migrate, provision, or log values.
export function productionConfigurationErrors(env) {
  const errors=[];
  const check=(name,operation)=>{try{operation();}catch{errors.push(name);}};
  check('DATABASE_URL / DATABASE_SSL / DATABASE_POOL_MAX',()=>databaseConfig({...env,NODE_ENV:'production'}));
  check('DATABASE_MIGRATION_URL TLS/direct endpoint configuration',()=>migrationDatabaseConfig({...env,NODE_ENV:'production'}));
  check('AUTH_RATE_LIMIT_SECRET',()=>rateLimitSecret({...env,NODE_ENV:'production'}));
  check('ATTACHMENT_STORAGE_PROVIDER / selected storage credentials',()=>attachmentStorageConfiguration(env));
  check('CALL_STUN_URLS / CALL_TURN_URLS / CALL_TURN_SHARED_SECRET',()=>{
    const ice=callIceConfiguration(env,'configuration-check','configuration-check');
    if(!ice.iceServers.some(server=>'credential' in server))throw new Error();
  });
  if(env.CALL_RELAY_ONLY && !['0','1'].includes(env.CALL_RELAY_ONLY))errors.push('CALL_RELAY_ONLY');
  const long=name=>typeof env[name]==='string' && env[name].length>=32;
  if(!long('CRON_SECRET')) {
    for(const name of ['MAINTENANCE_CLEANUP_SECRET','ATTACHMENT_CLEANUP_SECRET','CALL_CLEANUP_SECRET'])if(!long(name))errors.push(name);
  }
  if(env.CRON_SECRET && !long('CRON_SECRET'))errors.push('CRON_SECRET');
  return errors;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  config({path:['.env.local','.env'],quiet:true});
  const errors=productionConfigurationErrors(process.env);
  if(errors.length){console.error(`Production configuration missing or invalid: ${errors.join(', ')}`);process.exitCode=1;}
  else console.log('Configuration shape passed. Live database, private bucket, scheduler and TURN verification are still required.');
}
