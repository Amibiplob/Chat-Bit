import { activity } from "@/lib/server/realtime";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";

export async function POST(request: Request) {
  return messagingResponse(request, async () => activity(await jsonBody(request)));
}
