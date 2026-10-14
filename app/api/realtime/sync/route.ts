import { sync } from "@/lib/server/realtime";
import { MessagingError } from "@/lib/server/messaging-validation.mjs";
import { messagingResponse } from "@/lib/server/messaging-http";

export async function GET(request: Request) {
  return messagingResponse(request, async () => {
    const raw = new URL(request.url).searchParams.get("state");
    if (!raw || raw.length > 1024) throw new MessagingError("Invalid synchronization state.");
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new MessagingError("Invalid synchronization state."); }
    return sync(input);
  });
}
