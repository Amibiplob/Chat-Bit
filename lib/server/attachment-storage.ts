import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { attachmentStorage } from "./attachment-storage-core.mjs";

let client: SupabaseClient | undefined;

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "chatbit-attachments";
  if (!url || !key || !/^https:\/\//.test(url) || !/^[\w!.*'() &$@=;:+,?-]+$/.test(bucket)) {
    throw new Error("Supabase Storage is not configured.");
  }
  return { url, key, bucket };
}

function storage() {
  const { url, key, bucket } = configuration();
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return attachmentStorage(client, bucket);
}

export async function createAttachmentUpload(path: string) { return storage().upload(path); }
export async function readAttachmentObject(path: string) { return storage().read(path); }
export async function createAttachmentDownload(path: string, filename: string) { return storage().download(path, filename); }
export async function removeAttachmentObjects(paths: string[]) { return storage().remove(paths); }
