import { complete } from "@/lib/server/attachments";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ conversationId: string; attachmentId: string }> };
export async function POST(request: Request, { params }: Context) {
  return messagingResponse(request, async () => {
    const { conversationId, attachmentId } = await params;
    return { id: await complete(conversationId, attachmentId, await jsonBody(request)) };
  });
}
