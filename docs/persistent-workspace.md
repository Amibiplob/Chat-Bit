# Persistent workspace and push delivery

## Deployment evidence

On 2026-10-22 the user identified `https://chat-bit-rouge.vercel.app` as production, but its deployed commit is **not independently verified**. Local starting revision is `892cb60`. No production latency cause or resolution is established. The user will check the active Vercel deployment commit manually; this work does not push, deploy or modify production data.

## Persistent workspace

The previous shell persisted, but Calls, Contacts and Settings still depended on destination RSC navigation and their page components remounted. Only visited conversations could use the private RAM path. The shell now owns four bounded, account-keyed workspace panels. Each mounts on its first selection and remains mounted while hidden. Native Next.js history integration selects a panel immediately, including first visits, while calls history still displays honest loading until its authorized API returns. Settings subsection state, form edits and call search/history survive tab changes. Uncached conversation URLs and shared files retain normal authorized App Router navigation. Direct section loads still pass server authentication and SSR the selected shell panel.

The real Chrome regression passed history, drafts, pending sends, membership rejection and session expiration. With **all fetches delayed by 1,500 ms**, 30 section switches measured destination-panel DOM readiness **13/22 ms p50/p95**, with **zero RSC requests**. Ten cached conversation switches measured 37/59 ms with zero RSC requests/remounts. This establishes network independence locally, not production speed or completion of uncached API data. TypeScript and lint passed. Earlier measurements and the original baseline remain in `spa-messaging-performance.md`.

The same delayed-fetch harness in a separate original `892cb60` checkout measured **1,537/1,936 ms p50/p95** and **30 RSC requests** across 30 section switches. A later full-suite workspace run recorded 16/34 ms with zero RSC requests. Settings input/subsection state and Calls search/history belong to retained panels rather than server page instances. Conversation-header and Settings back links also use the workspace navigation path. Shared files and uncached conversations remain server-authorized destinations.

## Immediate outgoing messages

The audited `892cb60` handler already enqueued text before awaiting an API; a network wait in that handler was **not** established as the production cause. Its asynchronous return and React scheduling did not explicitly guarantee a DOM commit before the handler returned. Text acceptance now returns a synchronous boolean, flushes the accepted pending bubble and empty composer together, and schedules outbox network work in a subsequent microtask. Editing and attachments retain their durable asynchronous workflows. Server acknowledgement, polling, failure/retry, stable submission IDs and pending state across conversations remain separate.

The isolated Chrome test now asserts that the matching pending bubble **and empty composer exist before the click handler returns**, with every POST deliberately delayed by 1,500 ms. The passing 30-send run also passed response-loss-after-commit, uncached navigation, manual retry, duplicate prevention, newer-draft preservation and changed-account rejection. A separate original `892cb60` checkout ran the same 30-send harness, bundler and delay:

| Stage, p50/p95 | Original | Updated |
| --- | ---: | ---: |
| Optimistic DOM from click | 48/217 ms | 38/85 ms |
| Response headers from request start, includes artificial delay | 1,589/2,628 ms | 1,573/1,668 ms |
| Confirmed DOM from click | 1,648/2,660 ms | 1,649/1,708 ms |
| Recipient DOM from click, polling | 2,091/3,843 ms | 2,129/2,810 ms |

Compiler/host contention differed, so this does **not** prove a database, acknowledgement or recipient-delivery speedup. The structural result is synchronous local acceptance independent of delayed POSTs. An earlier concurrent-build run measured 42/74 ms optimistic DOM but later timed out on uncached navigation; the complete 12-send reproduction and final 30-send run passed. The transient timeout's cause is unconfirmed. A 12-send rerun also had optimistic p95 116 ms; the 85 ms final p95 is not a universal device guarantee. Reproduce with `TEST_SPA_SAMPLES=30 TEST_SPA_SEND_DELAY_MS=1500 TEST_SPA_SYNC_ACCEPTANCE=1` and the existing isolated SPA browser flags. Do not enable the new synchronous assertion on the original checkout.

## Optional push transport

**Hosted push has not been activated or verified.** The integration is prepared and the production subscription lifecycle is tested against an isolated protocol fixture. There are no hosted credentials, purchased services, provider account changes, deployments or production database writes in this work.

Options checked against official documentation on 2026-10-22:

| Option | Fit and limitation |
| --- | --- |
| [Native Vercel WebSockets](https://vercel.com/docs/functions/websockets) | Supported across plans, but connections end at function duration limits and new connections can reach different instances. Durable shared pub/sub coordination requires another service; an in-memory broadcast map would fail. Installed Next.js adapter/deployment compatibility still needs verification. |
| [Ably Free](https://ably.com/docs/platform/pricing/free) | Explicitly no card/no time limit; 6 million messages/month, 500 messages/second, 200 concurrent connections and channels; best-effort support/SLO. One SDK supplies token renewal, subscriptions and reconnection, avoiding a separate custom socket service and broker. Chosen for the optional integration. |
| [Pusher Sandbox](https://pusher.com/channels/pricing/) | Free, 100 concurrent connections and 200,000 messages/day. No-card signup was not independently established. It does not offer a simpler verified no-card setup here. |

The Neon transaction commits before `messagingResponse` schedules an invalidation using Next.js `after`. Successful conversation mutations (text, edits, deletes, read receipts and attachment lifecycle writes) notify current conversation members. Explicit typing/leave changes also notify the authorized partner after the activity transaction; periodic heartbeat writes do not publish. Events contain only `{v:1}`. They contain no message text, attachment URLs, canonical IDs or credentials. Channels are opaque HMAC-derived account invalidation channels, not client-selected conversation topics. Every message/list/presence read still uses session verification and membership authorization in Neon. Canonical snapshot IDs, submission IDs and server ordering handle duplicate hints, receipts and multi-device convergence.

The same-origin POST `/api/realtime/token` verifies the session and expected account, applies a 60/minute account limit and returns a signed, subscribe-only, one-channel token request with a 60-second TTL. The API key remains server-only. Clients cannot publish, select another account's channel, or use an event as authorization. The SDK is dynamically imported only after enabled configuration is returned; it is not loaded when the provider is disabled. Node's SDK stays external to Next's server bundle to preserve its native dependency loading. SDK logging is disabled; application errors use fixed redacted categories.

Attach/reattach triggers an authorized resync; event bursts serialize/coalesce resync work without repeatedly cancelling active snapshots. SDK reconnection handles ordinary connection loss; terminal connection/channel failures restart after a bounded 30-second delay. Account disposal aborts bootstrap/renewal, closes the connection and discards RAM. Any authenticated API 401 immediately hides the private workspace, clears conversation caches, drafts and outbox, and tears down subscriptions while routing to login. Settings state is also keyed by account. Session expiry time is supplied by the verified server session so a client timer/focus check can hide private panels even if synchronization is stalled; server expiry enforcement remains authoritative. Browser suspension and clock changes can delay client detection, and remote revocation/account-cookie changes require an authenticated request to discover.

While the channel is healthy, visible recovery polling uses a nominal **30-second** cadence (two polls/minute before action/event-driven refreshes). Disabled/unavailable push retains the existing bounded polling policy. Selection, foreground wake, sends and hints still request immediate authorized sync. No keep-awake job is added. Typing invalidations and a bounded local typing indicator prevent the longer recovery cadence from leaving typing stuck; idle online/last-seen updates can wait for recovery polling. Offline/hidden tabs close the SDK and abort renewal unless background message notifications are explicitly enabled and granted, matching the existing visibility policy; foreground recovery reconnects and resynchronizes. Session rejection also stops call media and signaling locally.

There is deliberately no transactional delivery outbox in this integration. A function crash after commit, a publish timeout or a dropped event can lose a **hint**. The committed message remains in Neon, and reconnect/foreground resync or the 30-second recovery poll retrieves it. This preserves eventual message recovery, not exactly-once event delivery or sub-second delivery during failures. Reducing fallback further would require stronger durable publish/retry infrastructure. Publish work has a bounded SDK request timeout and never delays or changes an already successful persistence acknowledgement. Token expiry can leave an existing subscriber receiving empty timing hints for up to its remaining TTL after revocation; no private data can be fetched without a valid session.

## Push verification boundaries

`tests/push.test.mjs` verifies opt-in configuration, SDK-generated token HMACs, restricted capabilities, opaque account separation, deduplicated recipients, empty payloads, event coalescing and late-bootstrap disposal. `tests/push-transport.test.mjs` runs the **actual production subscription lifecycle** using real Ably SDK clients over loopback sockets, rejects an outsider subscription and verifies reconnect resync. Its tiny broker is a protocol fixture, not an Ably service emulator or hosted authorization proof.

`tests/push.browser.test.mjs` uses two independent Chrome SDK clients, genuine isolated PostgreSQL sessions, committed messages, authorized canonical snapshots and the same subscription lifecycle. There is no polling in that fixture. Across 30 sends, a passing run measured:

| Local protocol fixture stage | p50 | p95 |
| --- | ---: | ---: |
| Durable database confirmation | 3 ms | 6 ms |
| Injected loopback publisher | 0 ms | 1 ms |
| Publish to SDK event | 1 ms | 3 ms |
| Publish to recipient DOM | 8 ms | 17 ms |

Duplicate hints did not duplicate DOM messages. A committed message with no hint was recovered on reconnect. These are **not full Next.js-to-hosted-Ably measurements**: the fixture injects a loopback publisher and synthetic transport tokens, bypassing hosted REST publication/token exchange. Actual Ably latency, token enforcement, quota behavior and service availability remain unverified. The ordinary Next.js two-account browser suite separately covers real Route Handlers, delayed sends, retries, read receipts, session/account rejection, attachments and calling. Never compare the 8/17 ms fixture numbers with application polling benchmarks as a measured provider speedup.

Reproduce with `TEST_PUSH_TRANSPORT=1` for the SDK fixture, or `TEST_PUSH_BROWSER=1`, `CHROME_BIN` and an explicitly disposable loopback `TEST_DATABASE_URL` for the browser/database fixture. Tests do not accept a production database. Standard application browser fixtures explicitly disable inherited provider configuration.

## Setup and production acceptance

1. Manually verify the deployed Vercel commit before attributing current production behavior to this code. No active deployment SHA was available locally.
2. Create an **Ably Free** account/app yourself. Select the free package, leave paid upgrades disabled and check its current limits. Create a server key scoped to `chatbit:*` with **publish** and **subscribe** capabilities (subscribe permits issuance of restricted client tokens). Do not grant browser publish, presence, history or wildcard capabilities in issued tokens. Do not paste the key into chat or client code.
3. Set server-only `CHATBIT_REALTIME_PROVIDER=ably` and `ABLY_API_KEY` to the full Ably API key in your intended environment. Existing `AUTH_RATE_LIMIT_SECRET` must remain strong and consistent across function instances; it derives opaque channels. No `NEXT_PUBLIC_` key, new Neon migration, Redis service or separate socket server is needed. `.env.example` documents the opt-in. Leaving the provider unset keeps polling; malformed enabled configuration returns a redacted unavailable error and falls back.
4. After manual push/deployment, test two accounts and multiple devices on warm healthy connections. Confirm the token endpoint is no-store, subscriptions are subscribe-only/account-scoped, and the browser has no API key. Exercise token renewal, session expiry/revocation, membership removal, changed cookies, disconnect/reconnect, missed hints, provider failure, duplicate hints, read receipts, typing, attachments and active calls across navigation.
5. Enable the existing opt-in numeric performance instrumentation briefly. Collect at least 30 warm sends and distinguish click-to-pending DOM, durable insert/commit, HTTP acknowledgement, server publish, provider event and recipient DOM. Publish and push-event stages are fixed labels with numeric durations/ephemeral trace IDs only. Browser `push-event` marks receipt; it is **not** a measured publish-to-event duration, and cross-host clocks are not assumed synchronized. Observe foreground/background recovery, naturally cold Neon/Vercel requests, real device keyboards/back navigation and regions separately. Disable logging afterward.
6. Check provider usage before broadening rollout. Fan-out counts, multiple devices, typing hints, token renewal and resync reads add usage. Free limits are not a production availability guarantee. If rollback is needed, unset `CHATBIT_REALTIME_PROVIDER`; clients revert to polling after reconnect/reload. Never use artificial Neon keep-awake requests.

Two matching Webpack build artifact inventories recorded 74 JavaScript chunks / 1,348,851 raw bytes / 431,135 independently gzipped bytes before and 75 / 1,546,838 / 481,685 after. The dynamically loaded Ably-containing chunk was 209,219 raw / 56,247 gzipped bytes. These are generated artifact inventories, **not** route transfer sizes or wire traffic; chunk redistribution, headers, Brotli and browser caching are excluded. Provider-disabled clients do not import that SDK chunk. Database usage and compressed production route traffic still require deployed measurement.

The authenticated shell client-reference chunks increased from 308,137 raw / 100,208 gzipped bytes to 342,465 / 109,570 bytes in those builds (shared references included, dynamic SDK excluded). Persistent sections therefore add upfront client code while removing their destination RSC waits; no improvement in first-load transfer or cold hydration is claimed.
