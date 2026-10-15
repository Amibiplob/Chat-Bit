import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { sessionCookieName, sessionHash, validSessionToken } from "./session-core.mjs";
import { rateLimitSecret } from "./auth-request.mjs";
import { MessagingError } from "./messaging-validation.mjs";
import * as queries from "./calling-queries.mjs";
import { callIceConfiguration } from "./calling-ice.mjs";

async function context(purpose: string) {
  const user=await getCurrentUser();
  const token=(await cookies()).get(sessionCookieName())?.value;
  if(!user || !validSessionToken(token)) throw new MessagingError("Sign in to continue.",401);
  const pool=getDatabase();
  await queries.callRateLimit(pool,user.id,purpose,rateLimitSecret());
  return {pool,userId:user.id,session:sessionHash(token)};
}
export async function create(input: unknown) {const c=await context("create");return queries.createCall(c.pool,c.userId,c.session,input);}
export async function sync(input: unknown) {const c=await context("sync");return queries.syncCalls(c.pool,c.userId,c.session,input);}
export async function action(id: string,input: unknown) {const c=await context("action");return queries.actionCall(c.pool,c.userId,c.session,id,input);}
export async function signal(id: string,input: unknown) {const c=await context("signal");return queries.signalCall(c.pool,c.userId,c.session,id,input);}
export async function history() {const c=await context("history");return queries.callHistory(c.pool,c.userId);}
export async function ice(id: string,tabId: string) {
  const c=await context("ice");
  await queries.authorizeCallIce(c.pool,c.userId,c.session,id,tabId);
  return callIceConfiguration(process.env,c.userId,id);
}
