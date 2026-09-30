import { ConversationLayout } from "@/components/conversation/conversation-layout";

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  return <ConversationLayout conversationId={conversationId} />;
}
