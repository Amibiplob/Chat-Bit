import "server-only";
import { withTransaction } from "./db";
import { readMessages, findPrivateAttachment } from "./conversation-queries.mjs";

// These primitives are not API endpoints. Authentication will supply userId.
export function getMessagesForUser(userId: string, conversationId: string, limit = 50) {
  return withTransaction((client) => readMessages(client, userId, conversationId, limit));
}

export function getAttachmentForUser(userId: string, attachmentId: string) {
  return withTransaction((client) => findPrivateAttachment(client, userId, attachmentId));
}
