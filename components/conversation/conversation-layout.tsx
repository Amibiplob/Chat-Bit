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
  const [messages, setMessages] = useState<Message[]>(
    conversation.messages.map((message) => ({
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
    })),
  );

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const headerConversation = {
    id: conversation.id,
    name:
      conversation.name ??
      (conversation.type === "DIRECT"
        ? "Direct Conversation"
        : "Group Conversation"),
    initials: getInitials(
      conversation.name ??
        (conversation.type === "DIRECT"
          ? "Direct Conversation"
          : "Group Conversation"),
    ),
    color: "bg-muted text-muted-foreground",
    online: false,
    message: "",
    time: "",
    unread: 0,
    pinned: false,
  };

  const conversationMessages = messages.filter(
    (message) => message.conversationId === conversationId,
  );

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
      <ConversationHeader conversation={headerConversation} />

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

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}