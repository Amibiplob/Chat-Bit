import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "./db";
import { sessionCookieName, validSessionToken, resolveSession } from "./session-core.mjs";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!validSessionToken(token)) return null;
  try {
    return await resolveSession(getDatabase(), token);
  } catch {
    // Fail closed without exposing driver/configuration errors, even in development.
    throw new Error("Session verification is temporarily unavailable");
  }
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
