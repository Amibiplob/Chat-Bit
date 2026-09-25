import { redirect } from "next/navigation";

import { ConversationLayout } from "@/components/conversation/conversation-layout";
import { createClient } from "@/lib/supabase/server";

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ConversationLayout
      conversationId={conversationId}
      currentUserId={user.id}
    />
  );
}