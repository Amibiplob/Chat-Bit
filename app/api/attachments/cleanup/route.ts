import { timingSafeEqual } from "node:crypto";
import { cleanupAttachments } from "@/lib/server/attachments";

// An external scheduler must POST this endpoint; no resources are provisioned.
export async function POST(request: Request) {
  const secret = process.env.ATTACHMENT_CLEANUP_SECRET;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!secret || secret.length < 32 || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    await cleanupAttachments();
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Cleanup unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
