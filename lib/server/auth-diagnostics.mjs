import { AuthError } from './auth-validation.mjs';

// Never serialize errors, messages, stacks, SQL, input, headers or environment.
// Even error.code is untrusted: emit only these known diagnostic identifiers.
const codes = new Set([
  '28P01', '28000', '42501', '42P01', '42703', '23502', '23503', '23505',
  '40001', '40P01', '53300', '53400', '57014', '57P01', '57P02', '57P03',
  '08000', '08001', '08003', '08004', '08006', '08P01',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'STORAGE_400', 'STORAGE_401', 'STORAGE_403', 'STORAGE_404', 'STORAGE_413', 'STORAGE_429', 'STORAGE_500', 'STORAGE_502', 'STORAGE_503', 'STORAGE_504', 'STORAGE_BUCKET_POLICY',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const stages = new Set(['request', 'auth-secret', 'database-config', 'authentication', 'session-cookie']);

/** @param {unknown} error @returns {string} */
export function diagnosticCode(error, depth = 0) {
  if (!error || typeof error !== 'object' || depth > 3) return 'UNCLASSIFIED';
  if ('code' in error && typeof error.code === 'string' && codes.has(error.code)) return error.code;
  if ('cause' in error) {
    const code = diagnosticCode(error.cause, depth + 1);
    if (code !== 'UNCLASSIFIED') return code;
  }
  if (error instanceof AggregateError) for (const cause of error.errors.slice(0, 4)) {
    const code = diagnosticCode(cause, depth + 1);
    if (code !== 'UNCLASSIFIED') return code;
  }
  return 'UNCLASSIFIED';
}

/** @param {unknown} error @param {string} operation @param {string} stage
 * @param {(event: string, fields: {operation:string,stage:string,code:string})=>void} log */
export function reportAuthFailure(error, operation, stage, log = console.error) {
  if (error instanceof AuthError) return;
  log('chatbit.auth.unavailable', {
    operation: operation === 'register' ? 'register' : 'login',
    stage: stages.has(stage) ? stage : 'unknown',
    code: diagnosticCode(error),
  });
}
