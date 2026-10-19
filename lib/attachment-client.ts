import type { AttachmentReservation } from "./attachment-types";
import { messagingRequest } from "./messaging-client";
import { attachmentFileError, normalizedFileType } from "./attachment-policy.mjs";
export { normalizedFileType } from "./attachment-policy.mjs";

const pending = new WeakMap<File, { conversationId: string; reservation: AttachmentReservation; clientId: string; completionStarted: boolean }>();

export async function uploadAttachment(conversationId: string, file: File, caption: string, onProgress: (value: number) => void, signal: AbortSignal) {
  const error = attachmentFileError(file);
  if (error) throw new Error(error);
  const mimeType = normalizedFileType(file);
  let state = pending.get(file);
  if (state?.conversationId !== conversationId) state = undefined;
  const reservation = state?.reservation ?? await messagingRequest<AttachmentReservation>(`/api/conversations/${conversationId}/attachments`, {
    method: "POST", body: JSON.stringify({ filename: file.name, mimeType, byteSize: file.size }), signal,
  });
  state ??= { conversationId, reservation, clientId: crypto.randomUUID(), completionStarted: false };
  pending.set(file, state);
  try {
    signal.throwIfAborted();
    if (!state.completionStarted) await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      const aborted = () => request.abort();
      const detach = () => signal.removeEventListener("abort", aborted);
      signal.addEventListener("abort", aborted, { once: true });
      request.open(reservation.fields ? "POST" : "PUT", reservation.signedUrl);
      request.timeout = 120000;
      request.ontimeout = () => { detach(); reject(new Error("The file upload timed out. Please try again.")); };
      if (!reservation.fields) {
        request.setRequestHeader("Content-Type", mimeType);
        request.setRequestHeader("x-upsert", "false");
      }
      request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
      request.onload = () => { detach(); if (request.status >= 200 && request.status < 300) resolve(); else reject(new Error(request.status === 413 ? "The file exceeds the storage upload limit." : request.status === 401 || request.status === 403 ? "File upload authorization expired or was denied. Please retry." : request.status === 429 ? "File storage is busy. Please wait and retry." : "File storage could not accept the upload. Please try again.")); };
      request.onerror = () => { detach(); reject(new Error("The upload connection failed.")); };
      request.onabort = () => { detach(); reject(new DOMException("Upload cancelled", "AbortError")); };
      if (reservation.fields) {
        const form = new FormData();
        for (const [key, value] of Object.entries(reservation.fields)) form.append(key, value);
        form.append('file', file);
        request.send(form);
      } else request.send(file);
    });
    state.completionStarted = true;
    const result = await messagingRequest<{ id: string }>(`/api/conversations/${conversationId}/attachments/${reservation.attachmentId}/complete`, {
      method: "POST", body: JSON.stringify({ clientId: state.clientId, caption }), signal,
    });
    pending.delete(file);
    return result;
  } catch (error) {
    // Only cancel before completion; a lost response may conceal a commit.
    if (!state.completionStarted) await messagingRequest(`/api/conversations/${conversationId}/attachments/${reservation.attachmentId}`, { method: "DELETE" }).catch(() => {});
    if (!state.completionStarted) pending.delete(file);
    throw error;
  }
}
