import { ConversationLayout } from "@/components/conversation/conversation-layout";
import { requireUser } from "@/lib/server/auth";

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  await requireUser();
  const { conversationId } = await params;

  return <ConversationLayout conversationId={conversationId} />;
}
