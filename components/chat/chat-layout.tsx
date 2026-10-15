"use client";

import { useState } from "react";

import { AppSidebar } from "./app-sidebar";
import { ConversationSidebar } from "./conversation-sidebar";
import { CallingProvider } from "@/components/calls/calling-provider";
import type { AuthUser } from "@/lib/auth-types";
import type { Conversation } from "@/lib/messaging-types";
import { usePathname, useRouter } from "next/navigation";
import { RealtimeProvider, useRealtime } from "./realtime-provider";

interface ChatLayoutProps {
  children: React.ReactNode;
  user: AuthUser;
  conversations: Conversation[];
}

export function ChatLayout({ children, user, conversations }: ChatLayoutProps) {
  return <CallingProvider userId={user.id}><RealtimeProvider initialConversations={conversations}><LiveChatLayout user={user}>{children}</LiveChatLayout></RealtimeProvider></CallingProvider>;
}

function LiveChatLayout({ children, user }: { children: React.ReactNode; user: AuthUser }) {
  const { conversations, status } = useRealtime();
  const [activeSection, setActiveSection] = useState("chats");
  const pathname = usePathname();
  const router = useRouter();
  const conversationOpen = pathname.startsWith("/chat/");

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        activeSection={activeSection === "chats" && pathname === "/calls" ? "calls" : activeSection}
        onSectionChange={(section) => {
          if (section === "calls" || section === "chats") { setActiveSection("chats"); router.push(section === "calls" ? "/calls" : "/chat"); }
          else setActiveSection(section);
        }}
        user={user}
        hasUnread={conversations.some((conversation) => conversation.unread > 0)}
      />

      {activeSection === "chats" && pathname !== "/calls" && (
        <>
          <div className={`${conversationOpen ? "hidden md:flex" : "flex"} ${pathname === "/chat" ? "w-full md:w-auto" : "w-auto"} shrink-0`}>
            <ConversationSidebar conversations={conversations} status={status} />
          </div>

          <main className={`${pathname === "/chat" ? "hidden md:flex" : "flex"} min-w-0 flex-1`}>{children}</main>
        </>
      )}

      {activeSection === "chats" && pathname === "/calls" && children}

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
