import "server-only";
import { withTransaction } from "./db";
import { readMessages, findPrivateAttachment } from "./conversation-queries.mjs";
import { requireUser } from "./auth";

export async function getMessagesForUser(conversationId: string, limit = 50) {
  const { id: userId } = await requireUser();
  return withTransaction((client) => readMessages(client, userId, conversationId, limit));
}

export async function getAttachmentForUser(attachmentId: string) {
  const { id: userId } = await requireUser();
  return withTransaction((client) => findPrivateAttachment(client, userId, attachmentId));
}
