/** @param {NodeJS.ProcessEnv} env */
export function databaseConfig(env = process.env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  // Normalize verified URL TLS modes before pg can override our strict ssl object.
  const urlMode = url.searchParams.get('sslmode');
  if (['require', 'verify-full'].includes(urlMode)) url.searchParams.delete('sslmode');
  // pg URL SSL options override the ssl object. Reject insecure overrides.
  if (['disable', 'allow', 'prefer', 'no-verify'].includes(url.searchParams.get('sslmode') ?? '')) {
    throw new Error('Use DATABASE_SSL=disable for local development; insecure URL SSL modes are forbidden');
  }
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().startsWith('ssl') || key === 'uselibpqcompat') {
      throw new Error('Configure verified TLS with DATABASE_SSL, not URL SSL parameters');
    }
  }
  const mode = env.DATABASE_SSL ?? 'verify';
  if (!['verify', 'disable'].includes(mode)) throw new Error('Invalid DATABASE_SSL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && (!url.hostname.endsWith('.neon.tech') || url.hostname.includes('.storage.'))) throw new Error('Use a Neon PostgreSQL endpoint');
  if (local && env.NODE_ENV === 'production') throw new Error('Production requires Neon PostgreSQL');
  if (url.searchParams.has('channel_binding')) throw new Error('Remove the libpq channel_binding URL parameter; pg negotiates channel binding directly');
  if (mode === 'disable' && (!local || env.NODE_ENV === 'production')) {
    throw new Error('TLS may only be disabled for a local development database');
  }
  const max = Number(env.DATABASE_POOL_MAX ?? '3');
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('DATABASE_POOL_MAX must be between 1 and 20');
  return {
    connectionString: url.toString(),
    ssl: mode === 'disable' ? false : { rejectUnauthorized: true },
    enableChannelBinding: true,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    application_name: 'chatbit',
  };
}

// Neon migrations must use the direct endpoint, never the transaction pooler.
export function migrationDatabaseConfig(env = process.env) {
  if (!env.DATABASE_MIGRATION_URL) throw new Error('A direct DATABASE_MIGRATION_URL is required');
  const runtime = databaseConfig(env);
  const settings = databaseConfig({ ...env, DATABASE_URL: env.DATABASE_MIGRATION_URL });
  const source = new URL(runtime.connectionString);
  const target = new URL(settings.connectionString);
  if (target.hostname.includes('-pooler.')) throw new Error('Neon migrations require a direct DATABASE_MIGRATION_URL');
  if (source.hostname.replace('-pooler.', '.') !== target.hostname || source.pathname !== target.pathname ||
      source.username !== target.username || (source.port || '5432') !== (target.port || '5432')) {
    throw new Error('Runtime and migration endpoints must select the same Neon branch, database and owning role');
  }
  return { ...settings, max: 1, statement_timeout: 120000 };
}
