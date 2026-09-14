"use client";

import { useMemo } from "react";

import { conversations } from "./conversation-data";
import { ConversationHeader } from "./conversation-header";

interface ConversationLayoutProps {
  conversationId: string;
}

export function ConversationLayout({
  conversationId,
}: ConversationLayoutProps) {
  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId],
  );

  if (!conversation) {
    return (
      <main className="flex h-svh min-w-0 flex-1 items-center justify-center bg-muted/20">
        <div className="px-6 text-center">
          <h1 className="text-lg font-semibold">Conversation not found</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            The conversation you are looking for does not exist.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-svh min-w-0 flex-1 flex-col bg-muted/20">
      <ConversationHeader conversation={conversation} />
    </main>
  );
}
