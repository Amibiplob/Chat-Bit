import { timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/server/db";
import { cleanupCalls } from "@/lib/server/calling-queries.mjs";
export async function POST(request: Request) {
  const secret=process.env.CALL_CLEANUP_SECRET;
  const expected=Buffer.from(`Bearer ${secret}`), received=Buffer.from(request.headers.get("authorization")??"");
  if(!secret || secret.length<32 || expected.length!==received.length || !timingSafeEqual(expected,received)) return Response.json({error:"Unauthorized"},{status:401,headers:{"Cache-Control":"no-store"}});
  try {await cleanupCalls(getDatabase());return Response.json({success:true},{headers:{"Cache-Control":"no-store"}});}
  catch {return Response.json({error:"Cleanup unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
