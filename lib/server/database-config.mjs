/** @param {NodeJS.ProcessEnv} env */
export function databaseConfig(env = process.env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  // pg URL SSL options override the ssl object. Reject insecure overrides.
  if (['disable', 'allow', 'prefer', 'no-verify'].includes(url.searchParams.get('sslmode') ?? '')) {
    throw new Error('Use DATABASE_SSL=disable for local development; insecure URL SSL modes are forbidden');
  }
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().startsWith('ssl') || key === 'uselibpqcompat') {
      throw new Error('Configure TLS with DATABASE_SSL and DATABASE_SSL_CA, not URL SSL parameters');
    }
  }
  const mode = env.DATABASE_SSL ?? 'verify';
  if (!['verify', 'disable'].includes(mode)) throw new Error('Invalid DATABASE_SSL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (mode === 'disable' && (!local || env.NODE_ENV === 'production')) {
    throw new Error('TLS may only be disabled for a local development database');
  }
  const max = Number(env.DATABASE_POOL_MAX ?? '3');
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('DATABASE_POOL_MAX must be between 1 and 20');
  return {
    connectionString,
    ssl: mode === 'disable' ? false : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) },
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    application_name: 'chatbit',
  };
}
