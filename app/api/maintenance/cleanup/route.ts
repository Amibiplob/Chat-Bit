import { cleanupResponse, cleanupSessions } from "@/lib/server/cleanup.mjs";
import { getDatabase } from "@/lib/server/db";

export async function POST(request: Request) {
  return cleanupResponse(request, process.env.MAINTENANCE_CLEANUP_SECRET, () => cleanupSessions(getDatabase()));
}
// Vercel cron uses GET and its CRON_SECRET bearer token. No job is auto-created.
export async function GET(request: Request) {
  return cleanupResponse(request, process.env.CRON_SECRET, () => cleanupSessions(getDatabase()));
}
