"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";

export function SecuritySettings() {
  const [twoFactor, setTwoFactor] = useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Security</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Protect your ChatBit account.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Password */}
        <section>
          <h3 className="text-sm font-semibold">Password</h3>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="size-5 text-muted-foreground" />
              </div>

              <div>
                <p className="text-sm font-medium">Account password</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Last changed recently
                </p>
              </div>
            </div>

            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Change password
            </button>
          </div>
        </section>

        {/* 2FA */}
        <section>
          <h3 className="text-sm font-semibold">Two-factor authentication</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Add an additional layer of security to your account.
          </p>

          <div className="mt-4 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                  <ShieldCheck className="size-5" />
                </div>

                <div>
                  <p className="text-sm font-medium">
                    Two-factor authentication
                  </p>

                  <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
                    Require a verification code when signing in from a new
                    device.
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                checked={twoFactor}
                onChange={(event) => setTwoFactor(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section>
          <h3 className="text-sm font-semibold">Active sessions</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Review where your account is currently signed in.
          </p>

          <div className="mt-4 rounded-xl border">
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Current session</p>

                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                    <CheckCircle2 className="size-3" />
                    Active
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  Linux · Chrome · Active now
                </p>
              </div>

              <span className="text-xs text-muted-foreground">Current</span>
            </div>
          </div>
        </section>

        {/* Security information */}
        <section className="rounded-xl bg-muted/40 p-4">
          <h3 className="text-sm font-medium">Security recommendation</h3>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Use a unique password and enable two-factor authentication when it
            becomes available in your account.
          </p>
        </section>
      </div>
    </div>
  );
}
