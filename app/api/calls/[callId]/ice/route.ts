import { ice } from "@/lib/server/calling";
import { messagingResponse } from "@/lib/server/messaging-http";
type Context={params:Promise<{callId:string}>};
export async function GET(request: Request,{params}:Context) {return messagingResponse(request,async()=>ice((await params).callId,new URL(request.url).searchParams.get("tabId")??""));}
