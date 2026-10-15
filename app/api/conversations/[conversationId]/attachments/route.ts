import { reserve } from "@/lib/server/attachments";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ conversationId: string }> };
export async function POST(request: Request, { params }: Context) {
  return messagingResponse(request, async () => reserve((await params).conversationId, await jsonBody(request)));
}
