import "server-only";
import { getDatabase } from "./db";
import { getCurrentUser } from "./auth";
import * as queries from "./messaging-queries.mjs";
import { MessagingError } from "./messaging-validation.mjs";

async function context() {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  return { pool: getDatabase(), userId: user.id };
}

export async function getConversationList() {
  const { pool, userId } = await context();
  return queries.listConversations(pool, userId);
}
export async function getConversation(id: string) {
  const { pool, userId } = await context();
  return (await queries.listConversations(pool, userId, id))[0] ?? null;
}
export async function startConversation(input: unknown) {
  const { pool, userId } = await context();
  return queries.createConversation(pool, userId, input);
}
export async function findUsers(search: unknown) {
  const { pool, userId } = await context();
  return queries.searchUsers(pool, userId, search);
}
export async function getMessages(id: string, options: unknown = {}) {
  const { pool, userId } = await context();
  return queries.getMessagePage(pool, userId, id, options);
}
export async function send(id: string, input: unknown) {
  const { pool, userId } = await context();
  return queries.sendMessage(pool, userId, id, input);
}
export async function edit(id: string, messageId: string, input: unknown) {
  const { pool, userId } = await context();
  return queries.editMessage(pool, userId, id, messageId, input);
}
export async function remove(id: string, messageId: string) {
  const { pool, userId } = await context();
  return queries.deleteMessage(pool, userId, id, messageId);
}
export async function markRead(id: string, input: unknown) {
  const { pool, userId } = await context();
  return queries.markMessagesRead(pool, userId, id, input);
}
