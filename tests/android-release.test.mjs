import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifySite, matchesStatement } from '../android/verify-site.mjs';
import { assetLinks } from '../android/config.mjs';

const env = { CHATBIT_ANDROID_ORIGIN: 'https://chatbit.test', ANDROID_SHA256_FINGERPRINTS: Array(32).fill('AB').join(':') };
test('Android site preflight requires package, certificate, relationship and successful HTTPS response', async () => {
  const expected = assetLinks(env);
  await verifySite(env, async (url, options) => {
    assert.equal(url, 'https://chatbit.test/.well-known/assetlinks.json');
    assert.equal(options.redirect, 'error');
    return Response.json(expected);
  });
  for (const statements of [null, [], [{}], [{ ...expected[0], relation: [] }], [{ ...expected[0], target: { ...expected[0].target, package_name: 'other.package' } }], [{ ...expected[0], target: { ...expected[0].target, sha256_cert_fingerprints: [] } }]]) {
    assert.equal(matchesStatement(statements, expected[0].target), false);
    await assert.rejects(verifySite(env, async () => Response.json(statements)), /Digital Asset Links/);
  }
  await assert.rejects(verifySite(env, async () => new Response(null, { status: 404 })), /Digital Asset Links/);
  await assert.rejects(verifySite(env, async () => { throw new Error('redirect blocked'); }), /redirect blocked/);
});
