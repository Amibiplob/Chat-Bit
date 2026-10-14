import type { Conversation, MessagePage, MessageCursor } from "./messaging-types";

export type Presence = { online: boolean; lastSeen: string | null; typing: boolean };
export type SyncInput = { conversationId: string | null; revision: string | null; oldest: MessageCursor | null; force: boolean };
export type SyncSnapshot = {
  revision: string;
  conversations: Conversation[] | null;
  page: MessagePage | null;
  presence: Presence | null;
};
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";
