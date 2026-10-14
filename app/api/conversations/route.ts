import { getConversationList, startConversation } from "@/lib/server/messaging";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

export async function GET(request: Request) {
  return messagingResponse(request, getConversationList);
}
export async function POST(request: Request) {
  return messagingResponse(request, async () => ({ id: await startConversation(await jsonBody(request)) }));
}
