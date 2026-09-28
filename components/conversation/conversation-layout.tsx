"use client";

import { useState } from "react";

import type { Message } from "./conversation-data";
import { ConversationHeader } from "./conversation-header";
import { MessageArea } from "./message-area";
import { MessageComposer } from "./message-composer";

interface ConversationLayoutProps {
  conversationId: string;

  currentUser: {
    id: string;
    name: string;
    avatar?: string;
  };

  conversation: {
    id: string;
    type: "DIRECT" | "GROUP";
    name: string | null;
    avatarUrl: string | null;

    messages: Array<{
      id: string;
      conversationId: string;
      senderId: string;
      content: string | null;
      type: string;
      createdAt: Date;
      updatedAt: Date;

      sender: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
      };
    }>;
  };
}

export function ConversationLayout({
  conversationId,
  currentUser,
  conversation,
}: ConversationLayoutProps) {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);

  /*
   * Convert Prisma messages into the format
   * your existing MessageArea expects.
   */
  const messages: Message[] = conversation.messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.displayName,
    content: message.content ?? "",
    createdAt: message.createdAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    status: "read",
    edited:
      message.updatedAt.getTime() !== message.createdAt.getTime(),
  }));

  /*
   * Temporary header object.
   *
   * Your current ConversationHeader still expects
   * the old conversation shape, so we adapt the
   * database conversation to it here.
   */
const headerConversation = {
  id: conversation.id,
  name:
    conversation.name ??
    (conversation.type === "DIRECT" ? "Conversation" : "Group"),
  avatar: conversation.avatarUrl ?? undefined,
  type: conversation.type,
  online: false,

  initials: (
    conversation.name ??
    (conversation.type === "DIRECT" ? "C" : "G")
  )
    .slice(0, 2)
    .toUpperCase(),

  color: "bg-muted",

  message: "",
  time: "",
  unread: 0,
  pinned: false,
};

  async function handleSend(content: string) {
    const trimmedContent = content.trim();

    if (!trimmedContent || sending) {
      return;
    }

    // Editing will be connected to the database later.
    if (editingMessage) {
      setEditingMessage(null);
      return;
    }

    try {
      setSending(true);

      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: trimmedContent,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      /*
       * The message is already saved in PostgreSQL.
       *
       * We don't add it manually here because this
       * component currently receives messages from
       * the server. Realtime will handle live updates
       * in a later step.
       */
      console.log("Message created:", data);

      setReplyingTo(null);
    } catch (error) {
      console.error("Send message error:", error);
    } finally {
      setSending(false);
    }
  }

  function handleReply(message: Message) {
    setReplyingTo(message);
    setEditingMessage(null);
  }

  function handleEdit(message: Message) {
    setEditingMessage(message);
    setReplyingTo(null);
  }

  function handleDelete(messageId: string) {
    console.log("Delete message:", messageId);
  }

  function handleCancelAction() {
    setReplyingTo(null);
    setEditingMessage(null);
  }

  return (
    <main className="flex h-svh min-w-0 flex-1 flex-col bg-muted/20">
      <ConversationHeader conversation={headerConversation} />

      <MessageArea
        messages={messages}
        currentUserId={currentUser.id}
        onReply={handleReply}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <MessageComposer
        onSend={handleSend}
        replyingTo={replyingTo}
        editingMessage={editingMessage}
        onCancel={handleCancelAction}
      />
    </main>
  );
}