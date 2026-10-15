import { settingsContext,mySettings } from "@/lib/server/settings";
import { updateProfile,updatePreferences } from "@/lib/server/settings-queries.mjs";
import { messagingResponse,jsonBody } from "@/lib/server/messaging-http";
export async function GET(request:Request) {return messagingResponse(request,mySettings);}
export async function PATCH(request:Request) {return messagingResponse(request,async()=> {
  const c=await settingsContext();return updateProfile(c.pool,c.userId,await jsonBody(request));
});}
export async function PUT(request:Request) {return messagingResponse(request,async()=> {
  const c=await settingsContext();return updatePreferences(c.pool,c.userId,await jsonBody(request));
});}
