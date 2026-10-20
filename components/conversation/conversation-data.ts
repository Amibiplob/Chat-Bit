export interface Conversation {
  id: string;
  name: string;
  initials: string;
  color: string;
  online: boolean;
  lastSeen?: string;
  message: string;
  time: string;
  unread: number;
  pinned: boolean;
}

export const conversations: Conversation[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    initials: "SJ",
    color: "bg-violet-100 text-violet-600",
    online: true,
    message: "Hey! Are we still meeting today?",
    time: "10:42 AM",
    unread: 2,
    pinned: true,
  },
  {
    id: "2",
    name: "Alex Morgan",
    initials: "AM",
    color: "bg-emerald-100 text-emerald-600",
    online: true,
    message: "The project looks great!",
    time: "9:31 AM",
    unread: 0,
    pinned: false,
  },
  {
    id: "3",
    name: "Design Team",
    initials: "DT",
    color: "bg-orange-100 text-orange-600",
    online: false,
    lastSeen: "last seen today at 9:42 AM",
    message: "You: I'll update the components.",
    time: "Yesterday",
    unread: 5,
    pinned: true,
  },
  {
    id: "4",
    name: "James Wilson",
    initials: "JW",
    color: "bg-pink-100 text-pink-600",
    online: false,
    message: "Thanks for your help!",
    time: "Yesterday",
    unread: 0,
    pinned: false,
  },
  {
    id: "5",
    name: "Emily Davis",
    initials: "ED",
    color: "bg-cyan-100 text-cyan-600",
    online: true,
    message: "Sent a photo",
    time: "Monday",
    unread: 0,
    pinned: false,
  },
  {
    id: "6",
    name: "Project Team",
    initials: "PT",
    color: "bg-amber-100 text-amber-600",
    online: false,
    message: "Mike: Meeting starts at 3 PM.",
    time: "Monday",
    unread: 0,
    pinned: false,
  },
];
