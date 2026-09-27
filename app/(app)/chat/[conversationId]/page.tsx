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

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      members: {
        some: {
          userId: user.id,
        },
      },
    },
    select: {
      id: true,
      type: true,
      name: true,
      avatarUrl: true,

      messages: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          sender: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    redirect("/chat");
  }
  return (
    <ConversationLayout
      conversationId={conversationId}
      currentUser={{
        id: profile.id,
        name: profile.displayName,
        avatar: profile.avatarUrl ?? undefined,
      }}
      conversation={conversation}
    />
  );
}
