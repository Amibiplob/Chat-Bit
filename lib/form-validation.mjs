import { z } from 'zod';

// Browser-safe schemas used by both the forms and authoritative server validators.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const MAX_MESSAGE_LENGTH = 10000;
export const searchSchema = z.string().trim().min(2).max(254);
export const emailSchema = z.string().trim().toLowerCase().max(254, 'Use at most 254 characters.').pipe(z.email('Enter a valid email address.'));
const existingPassword = z.string().min(1, 'Enter your password.').max(PASSWORD_MAX, 'Use at most 128 characters.');
const newPassword = z.string().min(PASSWORD_MIN, 'Password must be at least 8 characters.').max(PASSWORD_MAX, 'Password must be at most 128 characters.');
export const loginSchema = z.object({ email: emailSchema, password: existingPassword });
export const registrationSchema = loginSchema.extend({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters.'),
  password: newPassword,
});
export const registrationFormSchema = registrationSchema.extend({ confirmPassword: z.string() })
  .refine(value => value.password === value.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });
export const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your display name.').max(80, 'Use at most 80 characters.'),
  bio: z.string().trim().max(160, 'Use at most 160 characters.'),
}).strict();
export const passwordSchema = z.object({ currentPassword: existingPassword, newPassword, confirmPassword: newPassword }).strict()
  .refine(value => value.newPassword === value.confirmPassword, { message: 'New passwords must match.', path: ['confirmPassword'] })
  .refine(value => value.newPassword !== value.currentPassword, { message: 'Choose a different new password.', path: ['newPassword'] });

/** @param {import('zod').ZodType} schema @param {unknown} input @returns {Record<string, string>} */
export function formErrors(schema, input) {
  const result = schema.safeParse(input);
  const errors = {};
  if (!result.success) for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}
