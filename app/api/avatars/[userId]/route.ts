import { settingsContext } from "@/lib/server/settings";
import { readAvatar } from "@/lib/server/settings-queries.mjs";
import { MessagingError } from "@/lib/server/messaging-validation.mjs";
export async function GET(_request:Request,{params}:{params:Promise<{userId:string}>}) {
  try {const c=await settingsContext("avatarRead");const avatar=await readAvatar(c.pool,c.userId,(await params).userId);
    return new Response(new Uint8Array(avatar.content),{headers:{'Content-Type':avatar.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch(error) {return Response.json({error:'Avatar unavailable.'},{status:error instanceof MessagingError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
