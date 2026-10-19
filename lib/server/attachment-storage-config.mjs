// Server-only callers consume the values; diagnostics receive fixed codes only.
export function attachmentStorageConfiguration(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET ?? 'chatbit-attachments';
  const failure = (code) => new Error('Supabase Storage is not configured.', { cause: { code } });
  if (!url || !/^https:\/\//.test(url)) throw failure('STORAGE_CONFIG_URL');
  if (!key) throw failure('STORAGE_CONFIG_KEY');
  if (!/^[\w!.*'() &$@=;:+,?-]+$/.test(bucket)) throw failure('STORAGE_CONFIG_BUCKET');
  return { url, key, bucket };
}
