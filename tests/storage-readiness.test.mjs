import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageCorsMatches } from '../scripts/check-storage.mjs';
test('storage readiness requires exact trusted origin, POST/GET/HEAD and content type without changing settings',()=>{
  const rule={AllowedOrigins:['https://app.example'],AllowedMethods:['POST','GET','HEAD'],AllowedHeaders:['Content-Type']};
  assert.equal(storageCorsMatches([rule],'https://app.example'),true);
  for(const patch of [{AllowedOrigins:['*']},{AllowedOrigins:['https://app.example','*']},{AllowedOrigins:['https://other.example']},{AllowedMethods:['GET','HEAD']},{AllowedHeaders:[]}])assert.equal(storageCorsMatches([{...rule,...patch}],'https://app.example'),false);
  assert.equal(storageCorsMatches([rule],'http://app.example'),false);
  assert.equal(storageCorsMatches([{...rule,AllowedOrigins:['http://127.0.0.1:3000']}],'http://127.0.0.1:3000'),true);
});
