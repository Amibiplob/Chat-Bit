import { createClient } from '@supabase/supabase-js';

// Only used by the server's administrative Storage client, never a user client.
export function createAttachmentStorageClient({ url, key }, transport = globalThis.fetch) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        // The SDK's Storage fetch currently copies the API key into Bearer.
        // Opaque secret keys are not JWTs. Keep legacy JWT behavior intact.
        if (!key.startsWith('sb_secret_')) return transport(input, init);
        const headers = new Headers(init?.headers);
        headers.set('apikey', key);
        headers.delete('authorization');
        return transport(input, { ...init, headers });
      },
    },
  });
}
