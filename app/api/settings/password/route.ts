import { cookies } from "next/headers";
import { settingsContext } from "@/lib/server/settings";
import { changePassword } from "@/lib/server/settings-queries.mjs";
import { sessionCookieName } from "@/lib/server/session-core.mjs";
import { messagingResponse,jsonBody } from "@/lib/server/messaging-http";
export async function POST(request:Request) {return messagingResponse(request,async()=> {
  const c=await settingsContext("sensitive");
  const result=await changePassword(c.pool,c.userId,c.session,await jsonBody(request));
  (await cookies()).delete(sessionCookieName());return result;
});}
