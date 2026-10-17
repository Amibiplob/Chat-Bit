"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/server/db";
import { loginAccount, registerAccount } from "@/lib/server/auth-service.mjs";
import { assertSameOrigin, clientIdentity, rateLimitSecret } from "@/lib/server/auth-request.mjs";
import { publicAuthError, AuthError } from "@/lib/server/auth-validation.mjs";
import { revokeSession, sessionCookieName, sessionCookieOptions, validSessionToken } from "@/lib/server/session-core.mjs";

export type AuthState = { error?: string; values?: { email: string; name: string } };

async function authenticate(form: FormData, register: boolean): Promise<AuthState> {
  try {
    const requestHeaders = await headers();
    assertSameOrigin(requestHeaders);
    const cookieStore = await cookies();
    const input = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
    if (register && input.password !== form.get("confirmPassword")) {
      throw new AuthError("VALIDATION", "Passwords do not match.");
    }
    const context = { clientId: clientIdentity(requestHeaders), secret: rateLimitSecret(), previousToken: cookieStore.get(sessionCookieName())?.value };
    const session = await (register ? registerAccount : loginAccount)(getDatabase(), input, context);
    cookieStore.set(sessionCookieName(), session.token, sessionCookieOptions(session.expires));
  } catch (error) {
    // React resets successful action dispatches, including returned errors.
    // Return only bounded, non-sensitive fields; never serialize passwords.
    const text = (name: string, max: number) => typeof form.get(name) === "string" ? String(form.get(name)).slice(0, max) : "";
    return { error: publicAuthError(error), values: { email: text("email", 254), name: text("name", 80) } };
  }
  // Redirect throws internally; keep it outside the error handler.
  redirect("/chat");
}

export async function loginAction(_previous: AuthState, form: FormData): Promise<AuthState> {
  return authenticate(form, false);
}

export async function registerAction(_previous: AuthState, form: FormData): Promise<AuthState> {
  return authenticate(form, true);
}

export async function logoutAction(): Promise<AuthState> {
  try {
    assertSameOrigin(await headers());
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    if (validSessionToken(token)) await revokeSession(getDatabase(), token);
    cookieStore.set(sessionCookieName(), "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  } catch { return { error: "Unable to sign out. Please try again." }; }
  redirect("/login");
}
