// Server-only callers consume the values; diagnostics receive fixed codes only.
export function attachmentStorageConfiguration(env = process.env) {
  const provider = env.ATTACHMENT_STORAGE_PROVIDER ?? 'supabase';
  if (provider === 'neon') return neonStorageConfiguration(env);
  if (provider !== 'supabase') throw new Error('Invalid attachment storage provider.', { cause: { code: 'STORAGE_CONFIG_PROVIDER' } });
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET ?? 'chatbit-attachments';
  const failure = (code) => new Error('Supabase Storage is not configured.', { cause: { code } });
  if (!url || !/^https:\/\//.test(url)) throw failure('STORAGE_CONFIG_URL');
  if (!key) throw failure('STORAGE_CONFIG_KEY');
  if (!/^[\w!.*'() &$@=;:+,?-]+$/.test(bucket)) throw failure('STORAGE_CONFIG_BUCKET');
  return { url, key, bucket };
}

export function neonStorageConfiguration(env = process.env) {
  const fail = () => { throw new Error('Neon Storage is not configured.', { cause: { code: 'STORAGE_CONFIG_NEON' } }); };
  let endpoint;
  try { endpoint = new URL(env.AWS_ENDPOINT_URL_S3); } catch { fail(); }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.neon.tech') ||
      !endpoint.hostname.includes('.storage.') || endpoint.username || endpoint.password ||
      endpoint.port || endpoint.search || endpoint.hash || endpoint.pathname !== '/') fail();
  if (!env.AWS_ACCESS_KEY_ID?.trim() || !env.AWS_SECRET_ACCESS_KEY?.trim() || !/^[a-z0-9-]+$/.test(env.AWS_REGION ?? '')) fail();
  const bucket = env.NEON_STORAGE_BUCKET ?? 'chatbit-attachments';
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) fail();
  return { provider: 'neon', endpoint: endpoint.origin, region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }, bucket };
}
