import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '../form-validation.mjs';
export { searchSchema } from '../form-validation.mjs';

export const idSchema = z.uuid().transform((id) => id.toLowerCase());
export const contentSchema = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);
export const createConversationSchema = z.object({ participantId: idSchema });
export const sendMessageSchema = z.object({ content: contentSchema, clientId: idSchema, replyToId: idSchema.nullable().optional() });
export const editMessageSchema = z.object({ content: contentSchema });
export const readMessagesSchema = z.object({ messageIds: z.array(idSchema).min(1).max(100) });
export const pageSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.object({ id: idSchema, createdAt: z.iso.datetime() }).nullable().default(null),
});

export class MessagingError extends Error {
  /** @param {string} message @param {number} status @param {string | null} code */
  constructor(message, status = 400, code = null) { super(message); this.status = status; this.code = code; }
}

/** @template T @param {import('zod').ZodType<T>} schema @param {unknown} value @returns {T} */
export function validated(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new MessagingError('Invalid input. Messages must contain 1–10,000 characters and identifiers must be valid.');
  return result.data;
}

export function unavailableConversation() { return new MessagingError('Conversation or message not found.', 404); }
