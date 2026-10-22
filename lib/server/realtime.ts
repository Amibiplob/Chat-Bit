import "server-only";
import { scheduleActivityPush } from "./push";
import { diagnosticStep } from "./messaging-diagnostics.mjs";
import { headers, cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { MessagingError, validated } from "./messaging-validation.mjs";
import { realtimeRateLimit, synchronize, updateActivity, syncSchema, activitySchema } from "./realtime-queries.mjs";
import { sessionCookieName } from "./session-core.mjs";
import { rateLimitSecret } from "./auth-request.mjs";

async function context(purpose: "sync" | "activity") {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  const expected=(await headers()).get("X-ChatBit-Account");
  if(expected&&expected!==user.id)throw new MessagingError("Account changed. Sign in again.",401);
  const pool = await diagnosticStep("database-config", async () => getDatabase());
  await diagnosticStep("rate-limit", () => realtimeRateLimit(pool, user.id, purpose, rateLimitSecret()));
  return { pool, userId: user.id };
}

export async function sync(input: unknown) {
  const state=validated(syncSchema,input);
  const { pool, userId } = await context("sync");
  if(state.accountId&&state.accountId!==userId)throw new MessagingError("Account changed. Sign in again.",401);
  return synchronize(pool, userId, state);
}

export async function activity(input: unknown) {
  const { pool, userId } = await context("activity");
  const token = (await cookies()).get(sessionCookieName())?.value;
  const state=validated(activitySchema,input);
  const result=await updateActivity(pool, userId, token, state);
  if(state.notify&&state.conversationId)scheduleActivityPush(state.conversationId,userId);
  return result;
}
