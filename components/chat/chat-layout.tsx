"use client";

import { ConversationCacheProvider, ConversationViewport } from "@/components/conversation/conversation-cache-provider";
import { ConversationViewProvider } from "@/components/conversation/conversation-view-provider";
import { AppSidebar } from "./app-sidebar";
import { ConversationSidebar } from "./conversation-sidebar";
import { CallingProvider } from "@/components/calls/calling-provider";
import type { AuthUser } from "@/lib/auth-types";
import type { Conversation } from "@/lib/messaging-types";
import { usePathname } from "next/navigation";
import { RealtimeProvider, useRealtime } from "./realtime-provider";
import { MobileNavigation } from './mobile-navigation';
import { useCalling } from '@/components/calls/calling-provider';

interface ChatLayoutProps {
  children: React.ReactNode;
  user: AuthUser;
  conversations: Conversation[];
}

export function ChatLayout({ children, user, conversations }: ChatLayoutProps) {
  return <ConversationCacheProvider key={user.id}><ConversationViewProvider><CallingProvider userId={user.id}><RealtimeProvider initialConversations={conversations}><LiveChatLayout user={user}>{children}</LiveChatLayout></RealtimeProvider></CallingProvider></ConversationViewProvider></ConversationCacheProvider>;
}

function LiveChatLayout({ children, user }: { children: React.ReactNode; user: AuthUser }) {
  const { conversations, status } = useRealtime();
  const pathname = usePathname();
  const activeSection=pathname.startsWith("/shared")?"shared":pathname.startsWith("/contacts")?"contacts":pathname.startsWith("/settings")?"settings":"chats";
  const conversationOpen = pathname.startsWith("/chat/");
  const { state: calling } = useCalling();
  const callOpen = Boolean(calling.call && ['ringing', 'connecting', 'active'].includes(calling.call.status));

  return (
    <div className="cb-app-shell flex flex-col overflow-hidden bg-background md:flex-row">
      <AppSidebar
        activeSection={activeSection === "chats" && pathname === "/calls" ? "calls" : activeSection}
        user={user}
        hasUnread={conversations.some((conversation) => conversation.unread > 0)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">

      <div style={{ display: activeSection === "chats" && pathname !== "/calls" ? undefined : "none" }} className={`${conversationOpen ? "hidden md:flex" : "flex"} ${pathname === "/chat" ? "w-full md:w-auto" : "w-auto"} shrink-0`}>
        <ConversationSidebar conversations={conversations} status={status} />
      </div>
      <main className={`${pathname === "/chat" ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col overflow-y-auto`}><ConversationViewport>{children}</ConversationViewport></main>
      </div>
      <MobileNavigation hidden={conversationOpen || callOpen} pathname={pathname} unread={conversations.some(conversation => conversation.unread > 0)}/>
    </div>
  );
}
