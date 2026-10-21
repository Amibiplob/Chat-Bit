import { performanceRequest } from "@/lib/server/connection-performance.mjs";
import { ConversationRoute } from "@/components/conversation/conversation-cache-provider";
import { requireUser } from "@/lib/server/auth";
import { getConversation, getMessages } from "@/lib/server/messaging";
import { idSchema } from "@/lib/server/messaging-validation.mjs";
import { notFound } from "next/navigation";

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  return performanceRequest(async () => {
    const user = await requireUser();
    const { conversationId } = await params;

    if (!idSchema.safeParse(conversationId).success) notFound();
    const conversation = await getConversation(conversationId);
    if (!conversation) notFound();
    const page = await getMessages(conversationId);
    return <ConversationRoute key={conversationId} conversation={conversation} initialPage={page} currentUserId={user.id} />;
  });
}
