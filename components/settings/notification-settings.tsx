"use client";

import { useState } from "react";

interface NotificationOptionProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function NotificationOption({
  title,
  description,
  checked,
  onChange,
}: NotificationOptionProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>

        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 accent-blue-500"
      />
    </label>
  );
}

export function NotificationSettings() {
  const [messages, setMessages] = useState(true);
  const [mentions, setMentions] = useState(true);
  const [calls, setCalls] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [previews, setPreviews] = useState(true);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b px-5 py-6 md:px-8">
        <h2 className="text-xl font-semibold tracking-tight">Notifications</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Choose how ChatBit keeps you informed.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        <section>
          <h3 className="text-sm font-semibold">Notification preferences</h3>

          <p className="mt-1 text-xs text-muted-foreground">
            Control which notifications you receive.
          </p>

          <div className="mt-4 divide-y rounded-xl border">
            <NotificationOption
              title="New messages"
              description="Get notified when someone sends you a message."
              checked={messages}
              onChange={setMessages}
            />

            <NotificationOption
              title="Mentions"
              description="Get notified when someone mentions you."
              checked={mentions}
              onChange={setMentions}
            />

            <NotificationOption
              title="Calls"
              description="Receive notifications for incoming calls."
              checked={calls}
              onChange={setCalls}
            />
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Notification behavior</h3>

          <div className="mt-4 divide-y rounded-xl border">
            <NotificationOption
              title="Notification sounds"
              description="Play a sound when a notification arrives."
              checked={sounds}
              onChange={setSounds}
            />

            <NotificationOption
              title="Message previews"
              description="Show message content in notifications."
              checked={previews}
              onChange={setPreviews}
            />
          </div>
        </section>

        <section className="rounded-xl bg-muted/40 p-4">
          <p className="text-xs leading-5 text-muted-foreground">
            Browser notification permissions are controlled by your browser.
            ChatBit cannot send notifications if browser permissions are
            disabled.
          </p>
        </section>
      </div>
    </div>
  );
}
