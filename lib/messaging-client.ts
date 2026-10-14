export async function messagingRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal ?? AbortSignal.timeout(30000),
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new MessagingRequestError(data.error ?? "The request failed. Please try again.", response.status);
  return data as T;
}
export class MessagingRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
