import { ChatLayout } from "@/components/chat/chat-layout";
import { requireUser } from "@/lib/server/auth";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default async function ChatRouteLayout({ children }: ChatLayoutProps) {
  const user = await requireUser();
  return <ChatLayout user={user}>{children}</ChatLayout>;
}
