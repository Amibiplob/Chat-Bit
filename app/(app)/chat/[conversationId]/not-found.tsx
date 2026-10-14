import Link from "next/link";

export default function ConversationNotFound() {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="font-semibold">Conversation not found</h1><p className="text-sm text-muted-foreground">This conversation is unavailable.</p><Link className="text-sm text-blue-500" href="/chat">Back to conversations</Link></div>;
}
