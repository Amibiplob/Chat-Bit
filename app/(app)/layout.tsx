import { ChatLayout } from "@/components/chat/chat-layout";
import { requireUser } from "@/lib/server/auth";
import { getConversationList } from "@/lib/server/messaging";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default async function ChatRouteLayout({ children }: ChatLayoutProps) {
  const user = await requireUser();
  const conversations = await getConversationList();
  return <ChatLayout user={user} conversations={conversations}>{children}</ChatLayout>;
}
