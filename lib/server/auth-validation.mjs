export { emailSchema, loginSchema, registrationSchema } from '../form-validation.mjs';

export class AuthError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

/** @param {unknown} error */
export function publicAuthError(error) {
  return error instanceof AuthError ? error.message : 'Authentication is temporarily unavailable. Please try again.';
}
