import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureConnection } from '../scripts/measure-connection-latency.mjs';
test('latency probe is bounded and read-only, releases clients and rolls back failures',async()=>{
  const statements=[];let releases=0;
  const client={query:async sql=>{statements.push(sql);},release:()=>releases++};
  const sample=await measureConnection({connect:async()=>client});
  assert.deepEqual(statements,['BEGIN READ ONLY','SELECT 1','COMMIT']);
  assert.deepEqual(Object.keys(sample),['operation','poolMs','queryMs']);assert.equal(releases,1);
  client.query=async sql=>{statements.push(sql);if(sql==='SELECT 1') throw new Error('private connection');};
  await assert.rejects(measureConnection({connect:async()=>client}));
  assert.equal(statements.at(-1),'ROLLBACK');assert.equal(releases,2);
});
