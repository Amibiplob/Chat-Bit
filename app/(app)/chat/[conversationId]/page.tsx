import { redirect } from "next/navigation";

import { ConversationLayout } from "@/components/conversation/conversation-layout";
import { prisma } from "@/lib/prisma";
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

  // 1. Get authenticated user
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Get user's profile
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

  // 3. Get the conversation
  //    Only allow users who are members of it.
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

  // 4. Conversation doesn't exist
  //    OR current user isn't a member.
  if (!conversation) {
    redirect("/chat");
  }

  return (
    <ConversationLayout
      conversationId={conversationId}
      currentUser={{
        id: profile.id,
        name: profile.displayName ?? profile.username,
        avatar: profile.avatarUrl ?? undefined,
      }}
      conversation={conversation}
    />
  );
}