import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const registrationSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.'),
});

export class AuthError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

/** @param {unknown} error */
export function publicAuthError(error) {
  return error instanceof AuthError ? error.message : 'Authentication is temporarily unavailable. Please try again.';
}
