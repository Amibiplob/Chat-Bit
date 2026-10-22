import type { TokenRequest } from "ably";
import { messagingRequest } from "./messaging-client";
import { createPushSubscription } from "./push-subscription.mjs";
import { createPerformanceTrace } from "./connection-performance.mjs";

type Bootstrap = { enabled: false } | { enabled: true; channel: string; tokenRequest: TokenRequest };

export function startPushClient(userId: string, refresh: () => Promise<void>, healthy: { current: boolean }) {
  return createPushSubscription({
    token: signal => messagingRequest<Bootstrap>("/api/realtime/token", {
      method: "POST", headers: { "X-ChatBit-Account": userId }, signal,
    }),
    loadClient: async () => {
      const {Realtime} = await import("ably");
      return options => new Realtime(options);
    },
    refresh, healthy,
    onEvent: () => createPerformanceTrace("messaging").mark("push-event"),
  });
}
