import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registrationSchema, loginSchema, publicAuthError, AuthError } from '../lib/server/auth-validation.mjs';
import { hashPassword, verifyPassword } from '../lib/server/passwords.mjs';
import { assertSameOrigin, clientIdentity, rateLimitSecret } from '../lib/server/auth-request.mjs';
import { sessionCookieName, sessionCookieOptions, sessionHash, validSessionToken, SESSION_SECONDS, resolveSession } from '../lib/server/session-core.mjs';

test('registration validates names, normalized email and bounded passphrases', () => {
  const valid = { name: ' Test User ', email: '  Test@Example.COM ', password: 'a long passphrase' };
  assert.deepEqual(registrationSchema.parse(valid), { name: 'Test User', email: 'test@example.com', password: valid.password });
  for (const input of [
    { ...valid, name: ' ' }, { ...valid, name: 'a'.repeat(81) },
    { ...valid, email: 'not an email' }, { ...valid, email: 'a'.repeat(255) },
    { ...valid, password: 'short' }, { ...valid, password: 'a'.repeat(129) },
    { ...valid, password: null }, { ...valid, email: null },
  ]) assert.equal(registrationSchema.safeParse(input).success, false);
  assert.equal(loginSchema.safeParse({ email: 'test@example.com', password: 'a'.repeat(129) }).success, false);
});

test('Argon2id uses random salts and verifies without accepting wrong passwords', async () => {
  const password = ' spaces are preserved ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, password.trim()), false);
  assert.equal(await verifyPassword(undefined, password), false);
  assert.equal(await verifyPassword('$argon2id$invalid', password), false);
});

test('session cookies have seven-day expiry and production host-only protection', () => {
  const expires = new Date('2030-01-08T00:00:00Z');
  assert.deepEqual(sessionCookieOptions(expires, true), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', expires, maxAge: 604800 });
  assert.equal(SESSION_SECONDS, 604800);
  assert.equal(sessionCookieOptions(expires, false).secure, false);
  assert.equal(sessionCookieName(true), '__Host-chatbit_session');
  assert.equal(sessionCookieName(false), 'chatbit_session');
  assert.match(sessionHash('token'), /^[0-9a-f]{64}$/);
});

test('absent or malformed sessions are denied without querying the database', async () => {
  const database = { query: () => { throw new Error('Should not query'); } };
  for (const token of [undefined, null, '', 'short', 'a'.repeat(44), '/'.repeat(43)]) {
    assert.equal(validSessionToken(token), false);
    assert.equal(await resolveSession(database, token), null);
  }
});

test('auth mutations reject missing, opaque and cross-origin requests', () => {
  assert.doesNotThrow(() => assertSameOrigin(new Headers({ origin: 'https://chatbit.example', host: 'chatbit.example' })));
  for (const origin of [undefined, 'null', 'https://evil.example', 'https://chatbit.example.evil', 'file://chatbit.example']) {
    const headers = new Headers({ host: 'chatbit.example' });
    if (origin) headers.set('origin', origin);
    assert.throws(() => assertSameOrigin(headers), { code: 'ORIGIN' });
  }
});

test('rate limiting does not trust arbitrary proxy headers or allow missing production secrets', () => {
  const headers = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '5.6.7.8' });
  assert.equal(clientIdentity(headers, false), 'shared-client');
  assert.equal(clientIdentity(headers, true), '5.6.7.8');
  assert.equal(clientIdentity(new Headers({ 'x-vercel-forwarded-for': 'spoofed' }), true), 'shared-client');
  assert.throws(() => rateLimitSecret({ NODE_ENV: 'production' }));
  assert.throws(() => rateLimitSecret({ NODE_ENV: 'production', AUTH_RATE_LIMIT_SECRET: 'short' }));
  assert.equal(rateLimitSecret({ NODE_ENV: 'production', AUTH_RATE_LIMIT_SECRET: 'a'.repeat(32) }), 'a'.repeat(32));
});

test('unexpected errors never expose database details or passwords', () => {
  assert.equal(publicAuthError(new Error('postgres://private password_hash')), 'Authentication is temporarily unavailable. Please try again.');
  assert.equal(publicAuthError(new AuthError('CREDENTIALS', 'Invalid email or password.')), 'Invalid email or password.');
});
