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

export const currentUser = {
  id: "me",
  name: "Md Biplob Hosain",
  initials: "MB",
};

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

export const messages: Message[] = [
  {
    id: "message-1",
    conversationId: "1",
    senderId: "sarah",
    senderName: "Sarah Johnson",
    content: "Hey! Are we still meeting today?",
    createdAt: "10:30 AM",
    status: "read",
  },
  {
    id: "message-2",
    conversationId: "1",
    senderId: "me",
    senderName: "Md Biplob Hosain",
    content: "Yes! Absolutely. What time works best for you?",
    createdAt: "10:32 AM",
    status: "read",
  },
  {
    id: "message-3",
    conversationId: "1",
    senderId: "sarah",
    senderName: "Sarah Johnson",
    content: "How about 3 PM?",
    createdAt: "10:33 AM",
    status: "read",
  },
  {
    id: "message-4",
    conversationId: "1",
    senderId: "me",
    senderName: "Md Biplob Hosain",
    content: "3 PM works perfectly for me.",
    createdAt: "10:34 AM",
    status: "read",
  },
  {
    id: "message-5",
    conversationId: "1",
    senderId: "sarah",
    senderName: "Sarah Johnson",
    content: "Great! I'll send you the meeting details before then.",
    createdAt: "10:35 AM",
    status: "read",
  },
  {
    id: "message-6",
    conversationId: "1",
    senderId: "me",
    senderName: "Md Biplob Hosain",
    content: "Sounds good. See you then! 👋",
    createdAt: "10:36 AM",
    status: "read",
  },
];
