import { diagnosticCode } from './auth-diagnostics.mjs';
import { diagnosticStep } from './messaging-diagnostics.mjs';
import { resolveSession, validSessionToken } from './session-core.mjs';

// Keep pool creation lazy: absent or malformed cookies never need a database.
export async function verifySession(getDatabase, token, log = console.error) {
  if (!validSessionToken(token)) return null;
  return diagnosticStep('authentication', async () => {
    try {
      return await resolveSession(getDatabase(), token);
    } catch (cause) {
      const code = diagnosticCode(cause);
      log('chatbit.auth.unavailable', { operation: 'session', stage: 'authentication', code });
      // Never attach a driver error: framework development logging serializes
      // causes. A genuine outage must still fail closed, not become signed out.
      throw new Error('Session verification is temporarily unavailable', {
        cause: { code },
      });
    }
  });
}
