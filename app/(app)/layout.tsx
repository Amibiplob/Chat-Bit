import { ChatLayout } from "@/components/chat/chat-layout";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default function ChatRouteLayout({ children }: ChatLayoutProps) {
  return <ChatLayout>{children}</ChatLayout>;
}
