import { remove } from "@/lib/server/attachments";
import { messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ conversationId: string; attachmentId: string }> };
export async function DELETE(request: Request, { params }: Context) {
  return messagingResponse(request, async () => {
    const { conversationId, attachmentId } = await params;
    await remove(conversationId, attachmentId);
    return { success: true };
  });
}
