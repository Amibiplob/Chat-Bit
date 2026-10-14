import { edit, remove } from "@/lib/server/messaging";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ conversationId: string; messageId: string }> };
export async function PATCH(request: Request, { params }: Context) {
  return messagingResponse(request, async () => {
    const { conversationId, messageId } = await params;
    await edit(conversationId, messageId, await jsonBody(request));
    return { success: true };
  });
}
export async function DELETE(request: Request, { params }: Context) {
  return messagingResponse(request, async () => {
    const { conversationId, messageId } = await params;
    await remove(conversationId, messageId);
    return { success: true };
  });
}
