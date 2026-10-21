import { performanceRequest } from "@/lib/server/connection-performance.mjs";
import { ConversationRoute } from "@/components/conversation/conversation-cache-provider";
import { requireUser } from "@/lib/server/auth";
import { getConversationBootstrap } from "@/lib/server/messaging";
import { idSchema, MessagingError } from "@/lib/server/messaging-validation.mjs";
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
    try {
      const {conversation,page} = await getConversationBootstrap(conversationId);
      if (!conversation) notFound();
      return <ConversationRoute key={conversationId} conversation={conversation} initialPage={page} currentUserId={user.id} />;
    } catch(error) {
      if(error instanceof MessagingError && error.status === 404)notFound();
      throw error;
    }
  });
}
