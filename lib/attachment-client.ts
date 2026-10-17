import type { AttachmentReservation } from "./attachment-types";
import { messagingRequest } from "./messaging-client";
import { attachmentFileError, normalizedFileType } from "./attachment-policy.mjs";
export { normalizedFileType } from "./attachment-policy.mjs";

export async function uploadAttachment(conversationId: string, file: File, caption: string, onProgress: (value: number) => void, signal: AbortSignal) {
  const error = attachmentFileError(file);
  if (error) throw new Error(error);
  const mimeType = normalizedFileType(file);
  const reservation = await messagingRequest<AttachmentReservation>(`/api/conversations/${conversationId}/attachments`, {
    method: "POST", body: JSON.stringify({ filename: file.name, mimeType, byteSize: file.size }), signal,
  });
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const aborted = () => request.abort();
      const detach = () => signal.removeEventListener("abort", aborted);
      signal.addEventListener("abort", aborted, { once: true });
      request.open("PUT", reservation.signedUrl);
      request.setRequestHeader("Content-Type", mimeType);
      request.setRequestHeader("x-upsert", "false");
      request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
      request.onload = () => { detach(); if (request.status >= 200 && request.status < 300) resolve(); else reject(new Error("Storage rejected the upload.")); };
      request.onerror = () => { detach(); reject(new Error("The upload connection failed.")); };
      request.onabort = () => { detach(); reject(new DOMException("Upload cancelled", "AbortError")); };
      request.send(file);
    });
    return await messagingRequest<{ id: string }>(`/api/conversations/${conversationId}/attachments/${reservation.attachmentId}/complete`, {
      method: "POST", body: JSON.stringify({ clientId: crypto.randomUUID(), caption }), signal,
    });
  } catch (error) {
    // Cancellation and failed uploads revoke completion; expired reservations are
    // also reconciled if the browser loses its connection before this request.
    await messagingRequest(`/api/conversations/${conversationId}/attachments/${reservation.attachmentId}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
