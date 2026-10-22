import "server-only";
import { schedulePush } from "./push";
import { performanceRequest } from "./connection-performance.mjs";
import { timedOperation } from "./request-timing.mjs";
import { MessagingError } from "./messaging-validation.mjs";
import { diagnosticRequest, failureDetails, requestOperation } from "./messaging-diagnostics.mjs";
import { assertSameOrigin } from "./auth-request.mjs";

export async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new MessagingError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new MessagingError("A request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new MessagingError("Request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    try { return JSON.parse(bytes.toString("utf8")); } catch { throw new MessagingError("Invalid JSON."); }
  } finally { reader.releaseLock(); }
}

export async function messagingResponse(request: Request, operation: () => Promise<unknown>) {
  return performanceRequest(() => diagnosticRequest(async () => {
    try {
      if (request.method !== "GET") assertSameOrigin(request.headers);
      const result = await timedOperation(operation);
      schedulePush(request);
      return Response.json(result.value, { headers: { "Cache-Control": "no-store", "Server-Timing": result.serverTiming } });
    } catch (error) {
      const { status, message, requestId } = failureDetails(error, requestOperation(request.method, request.url));
      return Response.json({ error: message, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
    }
  }), new URL(request.url).pathname.startsWith("/api/calls") ? "calling" : "messaging");
}
