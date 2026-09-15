"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, LogOut } from "lucide-react";

export function AccountSettings() {
  const [language, setLanguage] = useState("English");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account preferences and access.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Account information */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Account information</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Basic information about your ChatBit account.
            </p>
          </div>

          <div className="divide-y rounded-xl border">
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Email address</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  biplob@example.com
                </p>
              </div>

              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">
                Verified
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Account ID</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  chatbit-user-001
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Language */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Language</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Choose the language used throughout ChatBit.
            </p>
          </div>

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option>English</option>
            <option>বাংলা</option>
          </select>
        </section>

        {/* Sessions */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Account sessions</h3>

            <p className="mt-1 text-xs text-muted-foreground">
              Manage devices where you are currently signed in.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Current browser</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Linux · Chrome · Active now
                </p>
              </div>

              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600">
                Current
              </span>
            </div>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out of all other devices
            <ChevronRight className="size-4" />
          </button>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-destructive/30 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />

            <div className="flex-1">
              <h3 className="text-sm font-semibold text-destructive">
                Delete account
              </h3>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Permanently delete your ChatBit account, messages, conversations
                and associated data.
              </p>

              {!deleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="mt-4 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  Delete my account
                </button>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground"
                  >
                    Confirm deletion
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(false)}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
