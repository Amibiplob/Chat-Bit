import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "./db";
import { sessionCookieName } from "./session-core.mjs";
import { verifySession } from "./session-verification.mjs";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return verifySession(getDatabase, token);
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
