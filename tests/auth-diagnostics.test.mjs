import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAuthFailure } from '../lib/server/auth-diagnostics.mjs';
import { AuthError, publicAuthError } from '../lib/server/auth-validation.mjs';

test('unexpected auth failures log only allowlisted operation, stage and code', () => {
  const events = [];
  const log = (...args) => events.push(args);
  const privateText = 'private-url-password-email-cookie-sql-certificate';
  for (const code of ['42501', '42P01', '28P01', 'ETIMEDOUT', 'ERR_TLS_CERT_ALTNAME_INVALID', privateText]) {
    const error = Object.assign(new Error(privateText), { code, detail: privateText, query: privateText });
    reportAuthFailure(error, 'register', 'authentication', log);
    assert.equal(publicAuthError(error), 'Authentication is temporarily unavailable. Please try again.');
    assert.deepEqual(events.at(-1), ['chatbit.auth.unavailable', {
      operation: 'register', stage: 'authentication', code: code === privateText ? 'UNCLASSIFIED' : code,
    }]);
  }
  reportAuthFailure(new Error(privateText), privateText, privateText, log);
  assert.deepEqual(events.at(-1)[1], { operation: 'login', stage: 'unknown', code: 'UNCLASSIFIED' });
  assert.ok(!JSON.stringify(events).includes(privateText));
});

test('known credential, origin, validation and rate-limit errors are not availability incidents', () => {
  for (const code of ['CREDENTIALS', 'ORIGIN', 'VALIDATION', 'RATE_LIMIT', 'REGISTRATION_FAILED']) {
    reportAuthFailure(new AuthError(code, 'Expected public error'), 'login', 'authentication', () => assert.fail('Unexpected log'));
  }
});

test('wrapped and aggregate connection failures preserve safe codes with bounded cause traversal', () => {
  const events = [], log = (...args) => events.push(args);
  const connection = Object.assign(new Error('private host'), { code: 'ECONNREFUSED' });
  reportAuthFailure(new Error('private wrapper', { cause: new AggregateError([connection]) }), 'login', 'authentication', log);
  assert.equal(events.at(-1)[1].code, 'ECONNREFUSED');
  const cyclic = new Error('private'); cyclic.cause = cyclic;
  reportAuthFailure(cyclic, 'login', 'auth-secret', log);
  assert.equal(events.at(-1)[1].code, 'UNCLASSIFIED');
  assert.ok(!JSON.stringify(events).includes('private'));
});
