import { create, history } from "@/lib/server/calling";
import { jsonBody, messagingResponse } from "@/lib/server/messaging-http";
export async function GET(request: Request) {return messagingResponse(request, history);}
export async function POST(request: Request) {return messagingResponse(request, async()=>create(await jsonBody(request)));}
