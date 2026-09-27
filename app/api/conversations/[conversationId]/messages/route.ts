import { NextResponse } from "next/server";

import { MessageType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { conversationId } = await params;

    // 1. Get the logged-in Supabase user
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // 2. Get message data from the request
    const body = await request.json();
    const content =
      typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 },
      );
    }

    // 3. Make sure the user belongs to this conversation
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this conversation" },
        { status: 403 },
      );
    }

    // 4. Create the message
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        content,
        type: MessageType.TEXT,
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
    });

    // 5. Return the newly created message
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Create message error:", error);

    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 },
    );
  }
}