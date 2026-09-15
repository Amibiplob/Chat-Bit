"use client";

import { useState } from "react";

export function PrivacySettings() {
  const [lastSeen, setLastSeen] = useState("everyone");
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [typing, setTyping] = useState(true);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Privacy</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Control what other people can see about you.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        {/* Visibility */}
        <section>
          <h3 className="text-sm font-semibold">Profile visibility</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Choose who can see your activity information.
          </p>

          <div className="mt-4 space-y-4 rounded-xl border p-4">
            <div className="space-y-2">
              <label htmlFor="last-seen" className="text-sm font-medium">
                Last seen
              </label>

              <select
                id="last-seen"
                value={lastSeen}
                onChange={(event) => setLastSeen(event.target.value)}
                className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">My contacts</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>
          </div>
        </section>

        {/* Chat privacy */}
        <section>
          <h3 className="text-sm font-semibold">Chat privacy</h3>

          <div className="mt-4 divide-y rounded-xl border">
            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Show online status</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Let contacts see when you are online.
                </p>
              </div>

              <input
                type="checkbox"
                checked={onlineStatus}
                onChange={(event) => setOnlineStatus(event.target.checked)}
                className="size-4 accent-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Read receipts</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Let others know when you have read their messages.
                </p>
              </div>

              <input
                type="checkbox"
                checked={readReceipts}
                onChange={(event) => setReadReceipts(event.target.checked)}
                className="size-4 accent-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Typing indicator</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Let others know when you are typing.
                </p>
              </div>

              <input
                type="checkbox"
                checked={typing}
                onChange={(event) => setTyping(event.target.checked)}
                className="size-4 accent-blue-500"
              />
            </label>
          </div>
        </section>

        {/* Blocked users */}
        <section>
          <h3 className="text-sm font-semibold">Blocked users</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            People you block cannot send you messages or call you.
          </p>

          <div className="mt-4 rounded-xl border p-5 text-center">
            <p className="text-sm font-medium">No blocked users</p>

            <p className="mt-1 text-xs text-muted-foreground">
              Users you block will appear here.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
