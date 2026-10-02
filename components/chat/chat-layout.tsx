"use client";

import { useState } from "react";

import { AppSidebar } from "./app-sidebar";
import { ConversationSidebar } from "./conversation-sidebar";
import { CallsPage } from "@/components/calls/calls-page";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  const [activeSection, setActiveSection] = useState("chats");

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {activeSection === "chats" && (
        <>
          <ConversationSidebar />

          <main className="flex min-w-0 flex-1">{children}</main>
        </>
      )}

      {activeSection === "calls" && <CallsPage />}

      {activeSection === "contacts" && (
        <main className="flex min-w-0 flex-1 items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Contacts</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Your contacts will appear here.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
