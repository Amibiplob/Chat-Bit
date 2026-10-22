import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "./auth";
import { getDatabase } from "./db";
import { rateLimitSecret } from "./auth-request.mjs";
import { requestRateLimit } from "./request-rate-limit.mjs";
import { MessagingError } from "./messaging-validation.mjs";
import { performanceStep } from "./connection-performance.mjs";
import { pushConfig, pushToken, publishHints } from "./push-core.mjs";

export async function getPushToken() {
  const user = await getCurrentUser();
  if (!user) throw new MessagingError("Sign in to continue.", 401);
  const expected = (await headers()).get("X-ChatBit-Account");
  if (!expected || expected !== user.id) throw new MessagingError("Account changed. Sign in again.", 401);
  const secret = rateLimitSecret();
  await requestRateLimit(getDatabase(), user.id, "push-token", 60, secret);
  let config;
  try { config = pushConfig(); } catch { throw new MessagingError("Realtime is temporarily unavailable.", 503); }
  if (!config) return { enabled: false };
  return pushToken(config, user.id, secret);
}

// Called only after a successful mutation has returned from its committed DB
// transaction. `after` is supported by Next/Vercel, unlike a floating promise.
// Hints can be lost on a function crash; authorized recovery polling is retained.
export function schedulePush(request: Request) {
  if (request.method === "GET" || process.env.CHATBIT_REALTIME_PROVIDER !== "ably") return;
  const id = /^\/api\/conversations\/([a-f0-9-]{36})\//i.exec(new URL(request.url).pathname)?.[1];
  if (!id) return;
  queueConversationHint(id);
}

export function scheduleActivityPush(id:string,userId:string){
  if(process.env.CHATBIT_REALTIME_PROVIDER==="ably")queueConversationHint(id,userId,true);
}

function queueConversationHint(id:string,actorId?:string,partnerOnly=false){
  after(async () => {
    try {
      const config = pushConfig();
      if (!config) return;
      const userId=actorId??(await getCurrentUser())?.id;
      if (!userId) return;
      const { rows } = await getDatabase().query<{ user_id: string }>(`SELECT cm.user_id FROM conversation_members cm
        WHERE cm.conversation_id=$1 AND EXISTS (SELECT 1 FROM conversation_members actor
          WHERE actor.conversation_id=cm.conversation_id AND actor.user_id=$2)`, [id, userId]);
      await performanceStep("publish", () => publishHints(config, rows.map(row => row.user_id).filter(id=>!partnerOnly||id!==userId), rateLimitSecret()));
    } catch {
      // No provider error objects, channel names, payloads or credentials.
      console.warn("chatbit.push.unavailable", { operation: "publish" });
    }
  });
}
