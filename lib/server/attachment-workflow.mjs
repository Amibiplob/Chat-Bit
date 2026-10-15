import { validateAttachmentContent } from './attachment-validation.mjs';

// External calls occur between short database operations, never inside a transaction.
export async function verifyAndFinalize({ queries, storage, pool, userId, conversationId, attachmentId, input }) {
  const row = await queries.pendingAttachment(pool, userId, conversationId, attachmentId);
  if (row.uploadState === 'available') return row.messageId;
  try {
    const bytes = await storage.read(row.storageKey);
    validateAttachmentContent(bytes, row.byteSize, row.mimeType, row.filename.split('.').at(-1)?.toLowerCase() ?? '');
    return await queries.finalizeAttachment(pool, userId, conversationId, attachmentId, input);
  } catch (error) {
    // A concurrent completion may have succeeded: only pending rows may fail.
    await queries.failAttachment(pool, userId, attachmentId, 'Upload verification or persistence failed');
    throw error;
  }
}

export async function reconcileAttachments(pool, queries, storage) {
  const rows = await queries.cleanupCandidates(pool, 20);
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  try {
    await storage.remove(rows.map((row) => row.storageKey));
    await queries.recordCleanup(pool, ids, true);
  } catch {
    await queries.recordCleanup(pool, ids, false);
  }
}
