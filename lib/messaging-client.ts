import { readMessagingResponse } from './messaging-response.mjs';
export { MessagingRequestError } from './messaging-response.mjs';

export async function messagingRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  return await readMessagingResponse(response) as T;
}
