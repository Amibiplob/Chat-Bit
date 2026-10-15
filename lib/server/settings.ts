import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { sessionCookieName,sessionHash } from "./session-core.mjs";
import { rateLimitSecret } from "./auth-request.mjs";
import { MessagingError } from "./messaging-validation.mjs";
import * as queries from "./settings-queries.mjs";
export async function settingsContext(operation="general") {
  const user=await getCurrentUser();
  const token=(await cookies()).get(sessionCookieName())?.value;
  if(!user || !token) throw new MessagingError("Sign in to continue.",401);
  const pool=getDatabase();
  await queries.settingsRateLimit(pool,user.id,operation,rateLimitSecret());
  return {pool,userId:user.id,session:sessionHash(token)};
}
export async function mySettings() {const c=await settingsContext();return queries.readSettings(c.pool,c.userId);}
