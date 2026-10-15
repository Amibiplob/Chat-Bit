import type { Attachment } from "./attachment-types";

export type Conversation = {
  id: string;
  participantId: string;
  name: string;
  initials: string;
  color: string;
  lastMessage: string | null;
  updatedAt: string;
  unread: number;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  status: "sent" | "read";
  edited: boolean;
  deleted: boolean;
  reply: { id: string; senderName: string; content: string; deleted: boolean } | null;
  attachments: Attachment[];
};

export type MessageCursor = { createdAt: string; id: string };
export type MessagePage = { messages: Message[]; nextCursor: MessageCursor | null };
export type SearchUser = { id: string; displayName: string };
