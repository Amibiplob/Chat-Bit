import { redirect } from "next/navigation";

import { ConversationLayout } from "@/components/conversation/conversation-layout";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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

  const profile = await prisma.profile.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  if (!profile) {
    redirect("/profile/create");
  }

  return (
    <ConversationLayout
      conversationId={conversationId}
      currentUser={{
        id: profile.id,
        name: profile.displayName ?? profile.username,
        avatar: profile.avatarUrl ?? undefined,
      }}
    />
  );
}