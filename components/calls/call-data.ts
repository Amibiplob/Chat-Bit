export type CallType = "voice" | "video";
export type CallDirection = "incoming" | "outgoing" | "missed";

export interface Call {
  id: string;
  name: string;
  initials: string;
  avatar?: string;
  type: CallType;
  direction: CallDirection;
  duration?: string;
  date: string;
  timestamp: string;
  online?: boolean;
}

export const recentCalls: Call[] = [
  {
    id: "call-1",
    name: "Sarah Wilson",
    initials: "SW",
    type: "video",
    direction: "outgoing",
    duration: "12:42",
    date: "Today",
    timestamp: "10:42 PM",
    online: true,
  },
  {
    id: "call-2",
    name: "Michael Chen",
    initials: "MC",
    type: "voice",
    direction: "incoming",
    duration: "08:16",
    date: "Today",
    timestamp: "8:24 PM",
    online: false,
  },
  {
    id: "call-3",
    name: "Emma Davis",
    initials: "ED",
    type: "video",
    direction: "missed",
    date: "Today",
    timestamp: "5:18 PM",
    online: true,
  },
  {
    id: "call-4",
    name: "Alex Johnson",
    initials: "AJ",
    type: "voice",
    direction: "outgoing",
    duration: "03:51",
    date: "Yesterday",
    timestamp: "9:32 PM",
    online: false,
  },
  {
    id: "call-5",
    name: "James Miller",
    initials: "JM",
    type: "voice",
    direction: "incoming",
    duration: "21:08",
    date: "Yesterday",
    timestamp: "6:15 PM",
    online: false,
  },
  {
    id: "call-6",
    name: "Olivia Brown",
    initials: "OB",
    type: "video",
    direction: "missed",
    date: "Sep 13",
    timestamp: "11:06 AM",
    online: false,
  },
];

export function getCallDirectionLabel(direction: CallDirection) {
  if (direction === "missed") {
    return "Missed call";
  }

  return direction === "incoming" ? "Incoming call" : "Outgoing call";
}

export function getCallTypeLabel(type: CallType) {
  return type === "video" ? "Video call" : "Voice call";
}
