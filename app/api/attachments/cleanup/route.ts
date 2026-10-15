import { cleanupResponse } from "@/lib/server/cleanup.mjs";
import { cleanupAttachments } from "@/lib/server/attachments";

// An external scheduler must POST this endpoint; no resources are provisioned.
export async function POST(request: Request) {
  return cleanupResponse(request, process.env.ATTACHMENT_CLEANUP_SECRET, cleanupAttachments);
}
export async function GET(request: Request) {
  return cleanupResponse(request, process.env.CRON_SECRET, cleanupAttachments);
}
