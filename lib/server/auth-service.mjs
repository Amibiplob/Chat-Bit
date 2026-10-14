import { transaction } from './transaction.mjs';
import { registrationSchema, loginSchema, AuthError } from './auth-validation.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { createSession } from './session-core.mjs';
import { enforceAuthRateLimit } from './auth-rate-limit.mjs';

/** @typedef {{clientId: string, secret: string, previousToken?: string}} AuthContext */
/** @param {import('pg').Pool} pool @param {unknown} input @param {AuthContext} context */
export async function registerAccount(pool, input, context) {
  const email = input && typeof input === 'object' && 'email' in input ? input.email : undefined;
  await enforceAuthRateLimit(pool, 'register', email, context.clientId, context.secret);
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new AuthError('VALIDATION', 'Use a name of 1–80 characters, a valid email, and a password of 12–128 characters.');
  const { name, email: normalized, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  return transaction(pool, async (client) => {
    const { rows } = await client.query(`
      INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
      ON CONFLICT (email) DO NOTHING RETURNING id
    `, [normalized, name, passwordHash]);
    if (!rows.length) throw new AuthError('REGISTRATION_FAILED', 'Unable to create an account with these details. Try signing in.');
    return createSession(client, rows[0].id, context.previousToken);
  });
}

/** @param {import('pg').Pool} pool @param {unknown} input @param {AuthContext} context */
export async function loginAccount(pool, input, context) {
  const email = input && typeof input === 'object' && 'email' in input ? input.email : undefined;
  await enforceAuthRateLimit(pool, 'login', email, context.clientId, context.secret);
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AuthError('CREDENTIALS', 'Invalid email or password.');
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [parsed.data.email]);
  const user = rows[0];
  const verified = await verifyPassword(user?.password_hash, parsed.data.password);
  if (!user || !verified) throw new AuthError('CREDENTIALS', 'Invalid email or password.');
  return transaction(pool, (client) => createSession(client, user.id, context.previousToken));
}
