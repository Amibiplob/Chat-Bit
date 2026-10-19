export class MessagingRequestError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) { super(message); this.status = status; }
}

/** Preserve HTTP status for session recovery, without exposing HTML gateway bodies. */
export async function readMessagingResponse(response) {
  let data;
  try { data = await response.json(); }
  catch {
    throw new MessagingRequestError(response.status === 401 ? 'Your session expired. Please sign in again.' : 'The server could not return a usable response. Please try again.', response.status);
  }
  if (!response.ok) throw new MessagingRequestError(typeof data?.error === 'string' ? data.error : 'The request failed. Please try again.', response.status);
  if (!data || typeof data !== 'object') throw new MessagingRequestError('The server returned an incomplete response. Please refresh.', response.status);
  return data;
}
