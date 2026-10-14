import { findUsers } from "@/lib/server/messaging";
import { messagingResponse } from "@/lib/server/messaging-http";

export async function GET(request: Request) {
  return messagingResponse(request, () => findUsers(new URL(request.url).searchParams.get("q")));
}
