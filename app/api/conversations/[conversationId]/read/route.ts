import { markRead } from "@/lib/server/messaging";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  return messagingResponse(request, async () => {
    await markRead((await params).conversationId, await jsonBody(request));
    return { success: true };
  });
}
