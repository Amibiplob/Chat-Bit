"use client";

import { useMemo, useState } from "react";

import {
  conversations,
  messages as initialMessages,
  type Message,
} from "./conversation-data";
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
}

export function ConversationLayout({
  conversationId,
  currentUser,
}: ConversationLayoutProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId],
  );

  const conversationMessages = useMemo(
    () =>
      messages.filter((message) => message.conversationId === conversationId),
    [messages, conversationId],
  );

  if (!conversation) {
    return (
      <main className="flex h-svh min-w-0 flex-1 items-center justify-center bg-muted/20">
        <div className="px-6 text-center">
          <h1 className="text-lg font-semibold">Conversation not found</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            The conversation you are looking for does not exist.
          </p>
        </div>
      </main>
    );
  }

  function handleSend(content: string) {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    if (editingMessage) {
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessage.id
            ? {
                ...message,
                content: trimmedContent,
                edited: true,
              }
            : message,
        ),
      );

      setEditingMessage(null);
      return;
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      conversationId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      content: trimmedContent,
      createdAt: new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
      status: "read",
    };

    setMessages((current) => [...current, newMessage]);
    setReplyingTo(null);
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
    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
  }

  function handleCancelAction() {
    setReplyingTo(null);
    setEditingMessage(null);
  }

  return (
    <main className="flex h-svh min-w-0 flex-1 flex-col bg-muted/20">
      <ConversationHeader conversation={conversation} />

      <MessageArea
        messages={conversationMessages}
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
