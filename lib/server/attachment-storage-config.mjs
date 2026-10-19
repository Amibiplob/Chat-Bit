// Server-only configuration; errors never include credential values.
export function attachmentStorageConfiguration(env = process.env) {
  const fail = () => { throw new Error('Neon Storage is not configured.', { cause: { code: 'STORAGE_CONFIG_NEON' } }); };
  let endpoint;
  try { endpoint = new URL(env.AWS_ENDPOINT_URL_S3); } catch { fail(); }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.neon.tech') ||
      !endpoint.hostname.includes('.storage.') || endpoint.username || endpoint.password ||
      endpoint.port || endpoint.search || endpoint.hash || endpoint.pathname !== '/') fail();
  if (!env.AWS_ACCESS_KEY_ID?.trim() || !env.AWS_SECRET_ACCESS_KEY?.trim() || !/^[a-z0-9-]+$/.test(env.AWS_REGION ?? '')) fail();
  if (!endpoint.hostname.endsWith(`.${env.AWS_REGION}.aws.neon.tech`)) fail();
  const bucket = env.NEON_STORAGE_BUCKET ?? 'chatbit-attachments';
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) fail();
  return { endpoint: endpoint.origin, region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }, bucket };
}
