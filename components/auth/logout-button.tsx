"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { logoutAction, type AuthState } from "@/app/actions/auth";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(logoutAction, {});
  return (
    <form action={action}>
      <button type="submit" disabled={pending} aria-label={pending ? "Signing out" : "Sign out"}
        title="Sign out" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50">
        <LogOut className="size-4" />
        {!compact && (pending ? "Signing out…" : "Sign out")}
      </button>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
