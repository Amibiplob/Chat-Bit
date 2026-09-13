import { MessageCircle } from "lucide-react";

export function EmptyChatState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
          <MessageCircle className="size-8" />
        </div>

        <h2 className="text-xl font-semibold tracking-tight">
          Start a conversation
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Select a conversation from the list to start chatting, sharing files,
          or making a call.
        </p>
      </div>
    </div>
  );
}
