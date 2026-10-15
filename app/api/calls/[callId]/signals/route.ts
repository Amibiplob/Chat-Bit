import { signal } from "@/lib/server/calling";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";
type Context={params:Promise<{callId:string}>};
export async function POST(request: Request,{params}:Context) {return messagingResponse(request, async()=>signal((await params).callId,await jsonBody(request)));}
