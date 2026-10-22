import { getPushToken } from "@/lib/server/push";
import { messagingResponse } from "@/lib/server/messaging-http";

export async function POST(request: Request) {
  return messagingResponse(request, getPushToken);
}
