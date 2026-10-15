import { preview } from "@/lib/server/attachments";
import { messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ attachmentId: string }> };
export async function GET(request: Request, { params }: Context) {
  try { return await preview((await params).attachmentId); }
  catch (error) { return messagingResponse(request, async () => { throw error; }); }
}
