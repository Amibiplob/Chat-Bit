import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { MessagingError } from "./messaging-validation.mjs";
import { realtimeRateLimit, synchronize, updateActivity } from "./realtime-queries.mjs";
import { sessionCookieName } from "./session-core.mjs";
import { rateLimitSecret } from "./auth-request.mjs";

async function context(purpose: "sync" | "activity") {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  const pool = getDatabase();
  await realtimeRateLimit(pool, user.id, purpose, rateLimitSecret());
  return { pool, userId: user.id };
}

export async function sync(input: unknown) {
  const { pool, userId } = await context("sync");
  return synchronize(pool, userId, input);
}

export async function activity(input: unknown) {
  const { pool, userId } = await context("activity");
  const token = (await cookies()).get(sessionCookieName())?.value;
  return updateActivity(pool, userId, token, input);
}
