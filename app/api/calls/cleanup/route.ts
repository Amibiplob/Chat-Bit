import { cleanupResponse } from "@/lib/server/cleanup.mjs";
import { getDatabase } from "@/lib/server/db";
import { cleanupCalls } from "@/lib/server/calling-queries.mjs";
export async function POST(request: Request) {
  return cleanupResponse(request, process.env.CALL_CLEANUP_SECRET, () => cleanupCalls(getDatabase()));
}
export async function GET(request: Request) {
  return cleanupResponse(request, process.env.CRON_SECRET, () => cleanupCalls(getDatabase()));
}
