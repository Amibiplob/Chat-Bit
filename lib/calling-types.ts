export type CallKind = "voice" | "video";
export type CallStatus = "ringing" | "connecting" | "active" | "rejected" | "missed" | "cancelled" | "ended" | "failed";
export type CallRecord = {
  id: string; conversationId: string; callerId: string; calleeId: string;
  name: string; kind: CallKind; status: CallStatus; createdAt: string;
  answeredAt: string | null; connectedAt: string | null; endedAt: string | null;
  endingReason: string | null; duration: number | null; owned: boolean;
};
export type CallSignal = { sequence: number; kind: "offer" | "answer" | "ice"; payload: RTCSessionDescriptionInit | RTCIceCandidateInit };
export type CallSnapshot = { call: CallRecord | null; signals: CallSignal[] };
export type CallingState = { call: CallRecord | null; local: MediaStream | null; remote: MediaStream | null;
  error: string; phase: string; muted: boolean; camera: boolean; working: boolean; seconds: number };
