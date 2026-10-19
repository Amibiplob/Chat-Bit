import { diagnosticStep, failureDetails } from './messaging-diagnostics.mjs';
import { validateAttachmentContent } from './attachment-validation.mjs';

// External calls occur between short database operations, never inside a transaction.
export async function verifyAndFinalize({ queries, storage, pool, userId, conversationId, attachmentId, input }) {
  const row = await queries.pendingAttachment(pool, userId, conversationId, attachmentId);
  if (row.uploadState === 'available') return row.messageId;
  const bytes = await diagnosticStep('storage-read', () => storage.read(row.storageKey));
  try {
    await diagnosticStep('attachment-validation', async () => validateAttachmentContent(bytes, row.byteSize, row.mimeType, row.filename.split('.').at(-1)?.toLowerCase() ?? ''));
  } catch (error) {
    // Invalid bytes are terminal. Provider/database failures remain pending and
    // retryable until reservation expiry; never revoke an ambiguous commit.
    await queries.failAttachment(pool, userId, attachmentId, 'Upload content verification failed').catch((cleanupError) => failureDetails(cleanupError, 'attachment.cleanup'));
    throw error;
  }
  return diagnosticStep('attachment-persistence', () => queries.finalizeAttachment(pool, userId, conversationId, attachmentId, input));
}

export async function reconcileAttachments(pool, queries, storage) {
  const rows = await queries.cleanupCandidates(pool, 20);
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  try {
    await storage.remove(rows.map((row) => row.storageKey));
    await queries.recordCleanup(pool, ids, true);
  } catch (error) {
    await diagnosticStep("attachment-cleanup", async () => { throw error; }).catch((failure) => failureDetails(failure, "attachment.cleanup"));
    await queries.recordCleanup(pool, ids, false);
  }
}
