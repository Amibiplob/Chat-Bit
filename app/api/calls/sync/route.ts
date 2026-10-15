import { sync } from "@/lib/server/calling";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";
export async function POST(request: Request) {return messagingResponse(request, async()=>sync(await jsonBody(request)));}
