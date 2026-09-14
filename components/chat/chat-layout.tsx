"use client";

import { useState } from "react";

import { AppSidebar } from "./app-sidebar";
import { ConversationSidebar } from "./conversation-sidebar";
import { MessageCircle } from "lucide-react";

export function ChatLayout() {
  const [activeSection, setActiveSection] = useState("chats");

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <ConversationSidebar />

      <section className="hidden min-w-0 flex-1 items-center justify-center bg-muted/20 md:flex">
        <div className="max-w-sm px-6 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">
            <MessageCircle />
          </div>

          <h2 className="text-xl font-semibold tracking-tight">
            Select a conversation
          </h2>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose a conversation from the list to start messaging.
          </p>
        </div>
      </section>
    </div>
  );
}
