import "server-only";
import { diagnosticStep } from "./messaging-diagnostics.mjs";
import { neonAttachmentStorage } from "./neon-storage.mjs";

import { createAttachmentStorageClient } from "./attachment-storage-client.mjs";
import { attachmentStorageConfiguration } from "./attachment-storage-config.mjs";
import { attachmentStorage } from "./attachment-storage-core.mjs";

let client: ReturnType<typeof createAttachmentStorageClient> | undefined;
let neon: ReturnType<typeof neonAttachmentStorage> | undefined;


async function storage() {
  return diagnosticStep("storage-config", async () => {
    const config = attachmentStorageConfiguration();
    if ('provider' in config) return neon ??= neonAttachmentStorage(config);
    const { url, key, bucket } = config;
    client ??= createAttachmentStorageClient({ url, key });
    return attachmentStorage(client, bucket);
  });
}

export async function createAttachmentUpload(path: string, file: { byteSize: number; mimeType: string }) { return diagnosticStep("storage-upload", async () => { const adapter = await storage(); return 'readUpload' in adapter ? adapter.upload(path, file) : adapter.upload(path); }); }
export async function readAttachmentObject(path: string) { return diagnosticStep("storage-read", async () => (await storage()).read(path)); }
export async function createAttachmentDownload(path: string, filename: string) { return diagnosticStep("storage-download", async () => (await storage()).download(path, filename)); }
export async function removeAttachmentObjects(paths: string[]) { return diagnosticStep("storage-remove", async () => (await storage()).remove(paths)); }

export async function readAttachmentUpload(path: string) {
  const adapter = await storage();
  return 'readUpload' in adapter ? adapter.readUpload(path) : adapter.read(path);
}
export async function sealAttachmentUpload(path: string, bytes: Uint8Array, mimeType: string) {
  const adapter = await storage();
  return 'seal' in adapter ? adapter.seal(path, bytes, mimeType) : path;
}

export async function pruneAttachmentUploads(paths: string[]) {
  const adapter = await storage();
  if ('prune' in adapter) await adapter.prune(paths);
}
