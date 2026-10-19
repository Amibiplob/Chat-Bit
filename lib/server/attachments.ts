import "server-only";
import { diagnosticStep, failureDetails } from "./messaging-diagnostics.mjs";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { requestRateLimit } from "./request-rate-limit.mjs";
import { rateLimitSecret } from "./auth-request.mjs";
import { MessagingError, validated } from "./messaging-validation.mjs";
import { finalizeAttachmentSchema, validateAttachmentContent } from "./attachment-validation.mjs";
import { attachmentPreviewResponse } from "./attachment-response.mjs";
import { verifyAndFinalize, reconcileAttachments } from "./attachment-workflow.mjs";
import * as queries from "./attachment-queries.mjs";
import { createAttachmentDownload, createAttachmentUpload, readAttachmentObject, readAttachmentUpload, sealAttachmentUpload, pruneAttachmentUploads, removeAttachmentObjects } from "./attachment-storage";

async function context(write = false) {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  const pool = await diagnosticStep("database-config", async () => getDatabase());
  await diagnosticStep("rate-limit", () => requestRateLimit(pool,user.id,write?"attachment-write":"attachment-read",write?20:60,rateLimitSecret()));
  return { pool, userId: user.id };
}

export async function cleanupAttachments() {
  await reconcileAttachments(getDatabase(), queries, { remove: removeAttachmentObjects, prune: pruneAttachmentUploads });
}

export async function reserve(conversationId: string, input: unknown) {
  const { pool, userId } = await context(true);
  await diagnosticStep("attachment-cleanup", () => cleanupAttachments()).catch((error) => failureDetails(error, "attachment.cleanup"));
  const row = await queries.reserveAttachment(pool, userId, conversationId, input);
  try {
    const signed = await createAttachmentUpload(row.key, row);
    return { attachmentId: row.id, path: signed.path, token: signed.token, signedUrl: signed.signedUrl, ...("fields" in signed ? { fields: signed.fields } : {}) };
  } catch (error) {
    await queries.failAttachment(pool, userId, row.id, "Upload authorization failed").catch((cleanupError: unknown) => failureDetails(cleanupError, "attachment.cleanup"));
    throw error;
  }
}

export async function complete(conversationId: string, attachmentId: string, input: unknown) {
  const { pool, userId } = await context(true);
  const value = validated(finalizeAttachmentSchema, input);
  return verifyAndFinalize({ queries, storage: { read: readAttachmentUpload, seal: sealAttachmentUpload }, pool, userId, conversationId, attachmentId, input: value });
}

export async function download(attachmentId: string, forceDownload = false) {
  const { pool, userId } = await context();
  const row = await diagnosticStep("database", () => queries.attachmentForDownload(pool, userId, attachmentId));
  if (!forceDownload && /^(image|video|audio)\//.test(row.mimeType)) {
    return { url: `/api/attachments/${attachmentId}/content`, expiresIn: 0 };
  }
  return { url: await createAttachmentDownload(row.storageKey, row.filename), expiresIn: 60 };
}

export async function remove(conversationId: string, attachmentId: string) {
  const { pool, userId } = await context(true);
  const path = await queries.scheduleAttachmentDeletion(pool, userId, conversationId, attachmentId);
  try {
    await removeAttachmentObjects([path]);
    const rows = await queries.cleanupCandidates(pool);
    const match = rows.find((row: { storageKey: string }) => row.storageKey === path);
    if (match) await queries.recordCleanup(pool, [match.id], true);
  } catch (error) { failureDetails(error, "attachment.cleanup"); /* delete_pending is retried opportunistically */ }
}

export async function preview(attachmentId: string, range: string | null = null) {
  const { pool, userId } = await context();
  const row = await diagnosticStep("database", () => queries.attachmentForDownload(pool, userId, attachmentId));
  if (!/^(image|video|audio)\//.test(row.mimeType)) throw new MessagingError("Preview unavailable.", 404);
  const bytes = await readAttachmentObject(row.storageKey);
  validateAttachmentContent(bytes, row.byteSize, row.mimeType, row.filename.split(".").at(-1) ?? "");
  return attachmentPreviewResponse(bytes, row.mimeType, range);
}

export async function sharedFiles(input: unknown) { const {pool,userId}=await context(); return diagnosticStep("database", () => queries.sharedAttachments(pool,userId,input)); }
