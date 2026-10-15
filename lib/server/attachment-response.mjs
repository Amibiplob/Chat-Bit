// Stream the verified buffer in bounded chunks so media above Vercel's buffered
// response limit can be delivered. Object verification still precedes delivery.
export function attachmentPreviewResponse(bytes, mimeType) {
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const next = Math.min(offset + 64 * 1024, bytes.length);
      controller.enqueue(bytes.subarray(offset, next));
      offset = next;
    },
  });
  return new Response(body, { headers: {
    'Content-Type': mimeType, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
