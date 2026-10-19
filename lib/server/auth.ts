import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { diagnosticCode } from "./auth-diagnostics.mjs";
import { diagnosticStep } from "./messaging-diagnostics.mjs";
import { getDatabase } from "./db";
import { sessionCookieName, validSessionToken, resolveSession } from "./session-core.mjs";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!validSessionToken(token)) return null;
  return diagnosticStep("authentication", async () => {
    try {
      return await resolveSession(getDatabase(), token);
    } catch (cause) {
      // Page renders can also fail outside the API wrapper. Retain only a safe
      // code so framework logging cannot serialize a raw database cause.
      throw new Error("Session verification is temporarily unavailable", { cause: { code: diagnosticCode(cause) } });
    }
  });
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
