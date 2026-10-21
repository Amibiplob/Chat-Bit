import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { databaseConfig } from '../lib/server/database-config.mjs';

// Explicit, bounded operator probe. No heartbeat, writes, actors or private URLs.
export async function measureConnection(pool) {
  const start=performance.now();
  const client=await pool.connect();
  const acquired=performance.now();
  try {
    await client.query('BEGIN READ ONLY');
    const queryStart=performance.now();
    await client.query('SELECT 1');
    const queryMs=performance.now()-queryStart;
    await client.query('COMMIT');
    return {operation:'database-probe',poolMs:Math.round((acquired-start)*10)/10,queryMs:Math.round(queryMs*10)/10};
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  config({path:['.env.local','.env'],quiet:true});
  let pool;
  try {
    pool=new pg.Pool(databaseConfig());
    console.log(JSON.stringify({sample:'first-acquisition',...await measureConnection(pool)}));
    console.log(JSON.stringify({sample:'reused-pool',...await measureConnection(pool)}));
  } catch {console.error('Read-only latency probe failed; connection details omitted.');process.exitCode=1;}
  finally {await pool?.end();}
}
