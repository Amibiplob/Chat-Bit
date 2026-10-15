import { download } from "@/lib/server/attachments";
import { messagingResponse } from "@/lib/server/messaging-http";

type Context = { params: Promise<{ attachmentId: string }> };
export async function GET(request: Request, { params }: Context) {
  return messagingResponse(request, async () => download((await params).attachmentId, new URL(request.url).searchParams.get("download") === "1"));
}
