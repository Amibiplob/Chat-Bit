import type { Attachment } from "./attachment-types";

export type Conversation = {
  id: string;
  participantId: string;
  avatarVersion?: number;
  name: string;
  initials: string;
  color: string;
  lastMessage: string | null;
  updatedAt: string;
  unread: number;
};

export type Message = {
  clientId?: string;
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  status: "sent" | "read";
  delivery?: "sending" | "failed";
  edited: boolean;
  deleted: boolean;
  reply: { id: string; senderName: string; content: string; deleted: boolean } | null;
  attachments: Attachment[];
};

export type MessageCursor = { createdAt: string; id: string };
export type MessagePage = { messages: Message[]; nextCursor: MessageCursor | null };
export type SearchUser = { id: string; displayName: string };
