import "server-only";
import { diagnosticStep } from "./messaging-diagnostics.mjs";
import { neonAttachmentStorage } from "./neon-storage.mjs";
import { attachmentStorageConfiguration } from "./attachment-storage-config.mjs";

let adapter: ReturnType<typeof neonAttachmentStorage> | undefined;
async function storage() {
  return diagnosticStep("storage-config", async () => adapter ??= neonAttachmentStorage(attachmentStorageConfiguration()));
}
export async function createAttachmentUpload(path: string, file: { byteSize: number; mimeType: string }) { return diagnosticStep("storage-upload", async () => (await storage()).upload(path, file)); }
export async function readAttachmentObject(path: string) { return diagnosticStep("storage-read", async () => (await storage()).read(path)); }
export async function createAttachmentDownload(path: string, filename: string) { return diagnosticStep("storage-download", async () => (await storage()).download(path, filename)); }
export async function removeAttachmentObjects(paths: string[]) { return diagnosticStep("storage-remove", async () => (await storage()).remove(paths)); }
export async function readAttachmentUpload(path: string) { return diagnosticStep("storage-read", async () => (await storage()).readUpload(path)); }
export async function sealAttachmentUpload(path: string, bytes: Uint8Array, mimeType: string) { return diagnosticStep("storage-upload", async () => (await storage()).seal(path, bytes, mimeType)); }
export async function pruneAttachmentUploads(paths: string[]) { return diagnosticStep("storage-remove", async () => (await storage()).prune(paths)); }
