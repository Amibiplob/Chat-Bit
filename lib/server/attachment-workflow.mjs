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
  const storageKey = storage.seal ? await storage.seal(row.storageKey, bytes, row.mimeType) : row.storageKey;
  return diagnosticStep('attachment-persistence', () => queries.finalizeAttachment(pool, userId, conversationId, attachmentId, input, storageKey));
}

export async function reconcileAttachments(pool, queries, storage) {
  const rows = await queries.cleanupCandidates(pool, 20);
  if (!rows.length) return;
  for (const available of [false, true]) {
    const group = rows.filter(row => (row.uploadState === 'available') === available);
    if (!group.length) continue;
    const ids = group.map(row => row.id);
    try {
      if (available) {
        if (!storage.prune) throw new Error('Storage staging cleanup unavailable');
        await storage.prune(group.map(row => row.storageKey));
      } else await storage.remove(group.map(row => row.storageKey));
      await queries.recordCleanup(pool, ids, true, available);
    } catch (error) {
      await diagnosticStep('attachment-cleanup', async () => { throw error; }).catch(failure => failureDetails(failure, 'attachment.cleanup'));
      await queries.recordCleanup(pool, ids, false, available);
    }
  }
}
