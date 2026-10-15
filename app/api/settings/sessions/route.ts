import { settingsContext } from "@/lib/server/settings";
import { revokeOtherSessions,sessionSummary } from "@/lib/server/settings-queries.mjs";
import { messagingResponse,jsonBody } from "@/lib/server/messaging-http";
export async function GET(request:Request) {return messagingResponse(request,async()=> {const c=await settingsContext();return sessionSummary(c.pool,c.userId,c.session);});}
export async function POST(request:Request) {return messagingResponse(request,async()=> {const c=await settingsContext("sensitive");return revokeOtherSessions(c.pool,c.userId,c.session,await jsonBody(request));});}
