import "server-only";
import { performanceStep } from "./connection-performance.mjs";
import { diagnosticStep } from "./messaging-diagnostics.mjs";
import { getDatabase } from "./db";
import { getCurrentUser } from "./auth";
import * as queries from "./messaging-queries.mjs";
import { MessagingError } from "./messaging-validation.mjs";
import { requestRateLimit } from "./request-rate-limit.mjs";
import { rateLimitSecret } from "./auth-request.mjs";

async function context(write = false) {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  const pool = await diagnosticStep("database-config", async () => getDatabase());
  await diagnosticStep("rate-limit", () => requestRateLimit(pool,user.id,write?"messaging-write":"messaging-read",write?90:180,rateLimitSecret()));
  return { pool, userId: user.id };
}

export async function getConversationList() {
  const { pool, userId } = await context();
  return performanceStep("conversation-list", () => diagnosticStep("database", () => queries.listConversations(pool, userId)));
}
export async function getConversation(id: string) {
  const { pool, userId } = await context();
  return (await performanceStep("conversation-init", () => diagnosticStep("database", () => queries.listConversations(pool, userId, id))))[0] ?? null;
}
// One session/rate-limit context for the initial conversation view. Both reads
// still independently enforce membership; no private server cache is added.
export async function getConversationBootstrap(id: string) {
  const { pool, userId } = await context();
  const [rows, page] = await Promise.all([
    performanceStep("conversation-init", () => queries.listConversations(pool, userId, id)),
    performanceStep("messages", () => queries.getMessagePage(pool, userId, id)),
  ]);
  return {conversation: rows[0] ?? null, page};
}
export async function startConversation(input: unknown) {
  const { pool, userId } = await context(true);
  return queries.createConversation(pool, userId, input);
}
export async function findUsers(search: unknown) {
  const { pool, userId } = await context();
  return diagnosticStep("database", () => queries.searchUsers(pool, userId, search));
}
export async function getMessages(id: string, options: unknown = {}) {
  const { pool, userId } = await context();
  return performanceStep("messages", () => queries.getMessagePage(pool, userId, id, options));
}
export async function send(id: string, input: unknown) {
  const { pool, userId } = await context(true);
  return diagnosticStep("database", () => queries.sendMessageReceipt(pool, userId, id, input));
}
export async function edit(id: string, messageId: string, input: unknown) {
  const { pool, userId } = await context(true);
  return queries.editMessage(pool, userId, id, messageId, input);
}
export async function remove(id: string, messageId: string) {
  const { pool, userId } = await context(true);
  return queries.deleteMessage(pool, userId, id, messageId);
}
export async function markRead(id: string, input: unknown) {
  const { pool, userId } = await context(true);
  return queries.markMessagesRead(pool, userId, id, input);
}
