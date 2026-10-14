import { getMessages, send } from "@/lib/server/messaging";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";
import { MessagingError } from "@/lib/server/messaging-validation.mjs";

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(request: Request, { params }: Context) {
  return messagingResponse(request, async () => {
    const search = new URL(request.url).searchParams;
    let cursor: unknown = null;
    if (search.has("cursor")) {
      const raw = search.get("cursor")!;
      if (raw.length > 256) throw new MessagingError("Invalid message cursor.");
      try { cursor = JSON.parse(raw); } catch { throw new MessagingError("Invalid message cursor."); }
    }
    return getMessages((await params).conversationId, { limit: search.has("limit") ? Number(search.get("limit")) : 50, cursor });
  });
}
export async function POST(request: Request, { params }: Context) {
  return messagingResponse(request, async () => ({ id: await send((await params).conversationId, await jsonBody(request)) }));
}
