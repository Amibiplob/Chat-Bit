export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  status: "sent" | "delivered" | "read";
  edited?: boolean;
}