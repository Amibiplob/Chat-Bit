// Stream the verified buffer in bounded chunks so media above Vercel's buffered
// response limit can be delivered. Object verification still precedes delivery.
/** @param {Uint8Array} bytes @param {string} mimeType @param {string|null} range */
export function attachmentPreviewResponse(bytes, mimeType, range = null) {
  let start = 0, end = bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${bytes.length}`,'Cache-Control':'private, no-store'}});
    if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${bytes.length}`,'Cache-Control':'private, no-store'}});
  }
  let offset = start;
  const body = new ReadableStream({
    pull(controller) {
      if (offset > end) { controller.close(); return; }
      const next = Math.min(offset + 64 * 1024, end + 1);
      controller.enqueue(bytes.subarray(offset, next));
      offset = next;
    },
  });
  return new Response(body, { status: range ? 206 : 200, headers: {
    'Accept-Ranges': 'bytes',
    ...(range ? {'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end-start+1)} : {}),
    'Content-Type': mimeType, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
