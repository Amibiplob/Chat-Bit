"use client";

import Link from "next/link";

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
  const pathname = usePathname();
  const activeSection=pathname.startsWith("/contacts")?"contacts":pathname.startsWith("/settings")?"settings":"chats";
  const router = useRouter();
  const conversationOpen = pathname.startsWith("/chat/");

  return (
    <div className={`flex h-svh overflow-hidden bg-background ${conversationOpen?"":"pb-[calc(3.5rem+env(safe-area-inset-bottom))]"} md:pb-0`}>
      <AppSidebar
        activeSection={activeSection === "chats" && pathname === "/calls" ? "calls" : activeSection}
        onSectionChange={(section) => {
          router.push(section==="calls"?"/calls":section==="contacts"?"/contacts":"/chat");
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

      {activeSection === "settings" && <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>}
      {activeSection === "contacts" && <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>}
      {!conversationOpen && <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">{[["/chat","Chats"],["/calls","Calls"],["/contacts","Contacts"],["/settings","Settings"]].map(([href,label])=><Link key={href} href={href} aria-current={pathname===href?'page':undefined} className="flex min-h-12 items-center px-3 text-sm">{label}</Link>)}</nav>}
    </div>
  );
}
