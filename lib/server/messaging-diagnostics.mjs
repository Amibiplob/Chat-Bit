import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { diagnosticCode } from './auth-diagnostics.mjs';
import { MessagingError } from './messaging-validation.mjs';
import { AuthError } from './auth-validation.mjs';

const context = new AsyncLocalStorage();
const failureStages = new WeakMap();
function errorStage(error, depth = 0) {
  if (!error || typeof error !== "object" || depth > 3) return undefined;
  return failureStages.get(error) ?? errorStage(error.cause, depth + 1);
}
const stages = new Set(['request', 'authentication', 'database-config', 'rate-limit', 'database', 'storage-config', 'storage-bucket', 'storage-upload', 'storage-read', 'storage-download', 'storage-remove', 'attachment-validation', 'attachment-persistence', 'attachment-cleanup']);
export function diagnosticRequest(operation) {
  return context.run({ requestId: randomUUID(), stage: 'request' }, operation);
}
export async function diagnosticStep(stage, operation) {
  try { return await operation(); }
  catch (error) {
    if (error && typeof error === 'object') {
      const previous = errorStage(error);
      if (!previous || (previous === 'database' && stage !== 'database')) failureStages.set(error, stages.has(stage) ? stage : 'request');
    }
    throw error;
  }
}
// Only fixed labels are derived from a URL; paths, IDs and queries never leave here.
export function requestOperation(method, url) {
  const path = new URL(url).pathname;
  const resource = path.includes('/attachments') ? 'attachment' : path.startsWith('/api/realtime/') ? 'delivery' : path.includes('/messages') ? 'message' : 'api';
  const action = path.endsWith('/complete') ? 'complete' : path.endsWith('/content') ? 'preview' : ({ GET: 'read', POST: 'write', PATCH: 'edit', DELETE: 'delete' }[method] ?? 'request');
  return `${resource}.${action}`;
}
export function failureDetails(error, operation, log = console.error) {
  const state = context.getStore() ?? { requestId: randomUUID(), stage: 'request' };
  const stage = errorStage(error) ?? state.stage;
  const expected = error instanceof MessagingError || error instanceof AuthError;
  const code = expected ? (error instanceof AuthError ? 'AUTHORIZATION' : error.code === 'ATTACHMENT_QUOTA' ? 'QUOTA' : ({401:'AUTHENTICATION',403:'AUTHORIZATION',413:'FILE_SIZE',429:'QUOTA'}[error.status] ?? 'VALIDATION')) : diagnosticCode(error);
  const timeout = ['ETIMEDOUT', '57014', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'STORAGE_504'].includes(code) || error?.name === 'TimeoutError';
  const category = expected ? code.toLowerCase() : timeout ? 'timeout' : stage.startsWith('storage-') ? 'storage' : ['authentication', 'database', 'database-config', 'rate-limit', 'attachment-persistence'].includes(stage) ? 'database' : 'internal';
  const safeOperation = /^(attachment|delivery|message|api)\.(complete|preview|read|write|edit|delete|request|cleanup)$/.test(operation) ? operation : 'api.request';
  log('chatbit.messaging.failure', { operation: safeOperation, stage, code, category, requestId: state.requestId });
  const status = error instanceof MessagingError ? error.status : error instanceof AuthError ? 403 : timeout ? 504 : category === 'internal' ? 500 : 503;
  const message = expected ? error.message : timeout ? 'The request timed out. Check the conversation before retrying.' : category === 'storage' ? 'File storage is temporarily unavailable. Please try again.' : category === 'database' ? 'Messaging is temporarily unavailable. Please try again.' : 'The request could not be completed. Please try again.';
  return { status, message, requestId: state.requestId };
}
