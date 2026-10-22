# SPA and messaging performance

For the subsequent persistent section panels, synchronous send commit and optional
Ably integration, see [Persistent workspace and push delivery](persistent-workspace.md).
The measurements and transport boundaries below describe the earlier milestones.

## Baseline and measurement contract

Starting revision: `f1a6992`. The existing persistent shell already avoids document reloads. Conversation contents still wait for destination RSC data. Drafts survive navigation, but message pages and optimistic bubbles do not. A text send creates a local pending bubble, disables the composer, and clears the draft only after acknowledgement. Receivers discover changes through serialized polling with a nominal 2,000 ms interval.

The opt-in performance logger (`localStorage['chatbit.performance']='1'`; server `CHATBIT_PERFORMANCE=1`) now separates request initiation, validation, insert, commit, optimistic React commit, acknowledgement, confirmation render and snapshot-to-render. Fixed labels, numeric durations and unrelated ephemeral trace IDs are the entire logging contract. No payloads, actor/message/conversation IDs, URLs, session values or provider details are logged. Browser DOM measurements indicate React/DOM availability, not physical screen paint. Sender and receiver traces are deliberately not joined using private identifiers.

`tests/spa-messaging.browser.test.mjs` uses genuine sessions and two isolated Chrome instances with synthetic fixtures in a uniquely named disposable loopback PostgreSQL schema. Its sender observer records first DOM appearance; its recipient observer records first DOM appearance using the same machine's wall-clock epoch. POST round-trip measures headers/acknowledgement availability, not pure database persistence. The `Server-Timing` database value measures aggregate transaction time, excluding network delivery. Server opt-in insert/commit spans distinguish persistence stages. The first request can include development compilation; p95 over 12 samples is effectively the maximum and is not a statistically reliable production tail estimate.

| Local Turbopack baseline, 12 sends | p50 | p95 |
| --- | ---: | ---: |
| Optimistic DOM display | 21 ms | 55 ms |
| POST response headers | 124 ms | 1,642 ms |
| Recipient DOM display from send click | 1,933 ms | 2,477 ms |
| Server aggregate transaction time | 12 ms | 29 ms |

Sender requests across this experiment: 20 sync, zero RSC and 49 other API requests (including typing/read activity). This is an experiment window, not a per-minute rate. Production Neon wake-up, Vercel regions, provider latency and physical mobile devices were not measured. These results confirm a polling wait in the local recipient path and an already fast local optimistic bubble; they do not attribute production delays to a specific provider.

Reproduce with `TEST_DATABASE_URL` pointing only to a disposable loopback database, `TEST_SPA_BROWSER=1`, `TEST_NEXT_TURBOPACK=1`, and `CHROME_BIN`. Run `node --test --test-isolation=none tests/spa-messaging.browser.test.mjs`. Add `TEST_SPA_BASELINE=1` only for the original behavior, to omit new recovery assertions. Tests never read a live database URL from dotenv and never alter environment files.

## Visited conversation navigation

The authenticated shell owns an eight-conversation RAM cache, retaining at most 100 authorized messages per conversation for 60 seconds since its last successful authorization. Direct requests remain server rendered and authorized. Links to uncached/expired conversations use ordinary Next.js navigation. A valid cached conversation uses Next.js-supported native history integration to display the correct retained messages immediately; the persistent authorized sync loop refreshes it in the background. This avoids a redundant RSC fetch for a warm cached switch. Membership rejection drops the cache and requests a fresh server route; session rejection clears it before redirecting. Cache data never enters localStorage, service-worker caches or shared server caches. Account identity keys the entire provider tree. Older history can be paginated again; restoring scroll outside the retained window can clamp.

The real Chrome navigation/history/draft/pending-send/expiry regression passed before and after this change. Uncached readiness was 1,321 ms before and 1,313 ms after; cached return readiness was 253 ms before and 134 ms after, with RSC requests reduced from one to zero on return. Readiness observation includes approximately 200 ms sampling and protocol overhead; these single samples demonstrate behavior, not a reliable speedup distribution. Shell remounts and document reloads remained zero. Cache identity/expiry/eviction tests, realtime tests, TypeScript and lint also passed.

## Realtime transport evaluation, checked 2026-10-22

The outgoing-text milestone adds a 20-entry account-scoped RAM outbox, serializes POSTs within each conversation, and keeps typing available during persistence. It clears the composer on local acceptance, displays pending/failed states honestly, and returns a canonical committed message from the existing POST. Canonical client submission IDs reconcile responses with polling, including a snapshot arriving before its acknowledgement. Recoverable network/408/429/5xx failures receive one bounded automatic retry using the same key; a failed bubble exposes manual retry. Failure restores an empty draft without overwriting newer typing. Composer resubmission of the same failed payload also reuses that key. Provider disposal aborts requests and discards private RAM; reload is not an offline send queue.

Outbox unit tests, isolated membership/idempotency/commit-visibility tests and the two-account Chrome test passed. The latter held and lost an acknowledgement after commit, navigated to another conversation and back, checked immediate composer clearing/responsiveness and verified exactly one persisted message. Before polling changes, 12 sends measured optimistic DOM 30/89 ms p50/p95, acknowledgement headers 104/1,367 ms, recipient DOM 1,958/2,377 ms and aggregate transactions 10/57 ms. This confirms recovery behavior and continued polling latency; it does not establish faster recipient delivery or a statistically reliable acknowledgement speedup.

No hosted realtime account, credentials, payment state or production configuration was changed. No push delivery is claimed. The current deployment configuration has not been inspected remotely.

| Option | Published free limits / access | Security and operational implications |
| --- | --- | --- |
| [Ably Free](https://ably.com/docs/platform/pricing/free) | No card, no time limit; 6 million messages/month, 500 messages/second, 200 concurrent connections and channels | Best-effort SLO/community support. [Short-lived capabilities](https://ably.com/docs/auth/capabilities) can restrict a verified session to subscribe-only per-user invalidations. Server keys stay private. Requires a real account/key and live subscription, revocation, quota and reconnect tests. |
| [Pusher Sandbox](https://pusher.com/channels/pricing/) | Free; 200,000 messages/day, 100 concurrent connections | [Server-signed private channels](https://pusher.com/docs/channels/server_api/authorizing-users/) support membership authorization. Card-free signup was not established from the pricing page, so it is not presented as verified no-card availability. Account/key, cluster choice, revocation, fan-out accounting and live tests are required. |
| [Vercel WebSockets](https://vercel.com/docs/functions/websockets) | Current documentation describes support on all plans; connections still close at function maximum duration | A Route Handler is not a permanent socket daemon. External coordination is still needed across instances/deployments; reconnect must authorize and resynchronize. This repo's installed Next.js/deployment support and cost limits have not been verified. Do not infer deployability from a local socket demo or older blanket claims that Vercel cannot serve sockets. |

If adopting a hosted transport, prefer server-published **invalidation hints after a durable Neon commit**, with short-lived subscribe-only identity capabilities, no private contents in event payloads, authenticated database resynchronization, and a slow polling fallback. Ephemeral hints cannot replace persistence or recover missed events. A production implementation must handle the commit/publish failure gap (durable transactional outbox or verified fallback), session revocation, multiple devices, authorization changes, service outages and usage caps. Ably is the clearest documented no-card evaluation candidate; it is not provisioned or implemented by this change. SSE from an app function would still need external cross-instance notification or database polling, plus reconnect/time-limit handling; keeping one database connection per browser is inappropriate for the existing pool budget.

## Bounded polling changes

Foreground interaction, a newly arriving message, selection or wake opens a 15-second active window with a nominal 1,000 ms cadence. A quiet open conversation falls back to 2,500 ms; other sections use 5,000 ms. Existing explicitly enabled background notifications poll at 15,000 ms; otherwise hidden/offline tabs suspend requests. Foreground recovery and successful sends request immediate authorized resynchronization. Requests remain serialized, request time is subtracted from cadence, superseded selection requests abort, rate limits remain authoritative and failure backoff remains bounded. Receipt-only changes do not renew the active window. No independent keep-awake endpoint or job is added.

In the 12-send local rerun, optimistic DOM was 27/63 ms p50/p95; acknowledgement headers 130/1,439 ms; recipient DOM 979/2,390 ms; transaction aggregate 15/24 ms. Sender request counts were 23 sync, zero RSC, 32 other API calls over this shorter experiment. Median receiver wait improved in these samples; p95 still includes cold compilation/network effects and is not consistently sub-second. Fast polling can double active request frequency from 30 to 60 nominal polls/minute; quiet conversation/list/background-notification rates are approximately 24/12/4 per minute before request latency and failure backoff. Multiple active tabs share the existing account limit and may back off. There is no promise of sub-second delivery from polling, nor a claim of lower database usage under continuous traffic.

## Request responsiveness and mobile behavior

Initial conversation SSR now shares one authenticated/rate-limited read context and starts metadata/message reads concurrently, replacing two sequential contexts. React's existing request-scoped session verification remains intact. Both reads still enforce membership. Already-read incoming rows are excluded from read-receipt submissions, preventing repeated writes and forced snapshots on remount. A rejected cached membership renders an explicit unavailable state rather than an endless placeholder. Native cached transitions now start the same sanitized navigation timing as router transitions.

The updated Chrome regression passed browser history, correct conversation identity, pending text send across remount, persisted drafts/scroll, 320/768/1280 px layouts, a shortened 320x480 composer viewport, mobile section navigation and session expiry. Cached return made zero RSC requests; uncached development timing varied (2,011 ms in this rerun), so concurrency is not claimed as a measured production latency win. TypeScript, lint and targeted cache/realtime/performance tests passed. Existing dynamic viewport and safe-area sizing, media previews, active calling providers and production-only public offline worker remain in place. There is no APK/TWA or added animation. Physical Android back/IME behavior, native installation and real mobile networks still require device tests.

Further recovery checks ensure that only a fresh authorized response can clear a rejected membership; local view renders cannot renew the authorization TTL or undo a denial. An authorized snapshot can fill an expired/missing active entry without an extra `router.refresh`. Canonical acknowledgements merge in server timestamp/ID order while unsaved messages retain local acceptance order. Submission reconciliation also checks sender identity. A changed-account sync is rejected before any new-account snapshot is returned, and outgoing POSTs carry the expected account ID as an additional assertion against the verified session. The cookie remains the authority; the assertion grants no permissions. Session rejection aborts/clears the entire outbox.

The final Webpack navigation regression recorded ten warm visited switches at 34/45 ms p50/p95, zero RSC fetches and zero shell remounts. The separate original `f1a6992` checkout recorded 359/2,524 ms, ten RSC fetches and zero remounts for ten switches with the same observer and bundler. These small local batches were not an exclusive-host controlled experiment, and their p95 is effectively the maximum; they are not production percentiles. The confirmed structural result is immediate RAM-backed content without a destination RSC fetch. Uncached first switches remained variable (3,283 ms baseline, 4,100 ms in the final Webpack regression); no uncached speedup is claimed.

## Final local verification

The complete `pnpm test` run with disposable PostgreSQL, `TEST_AUTH_HTTP=1`, `TEST_NAVIGATION_BROWSER=1`, `TEST_SPA_BROWSER=1`, `TEST_CALLING_BROWSER=1`, Turbopack and Chrome passed **214 tests**, skipped **2**, and failed none. The skips were the PostgreSQL 17-specific security fixture and the standalone runtime-browser test requiring a separately started origin. Coverage includes real signup/login/logout, protected routes, two-account messaging, drafts, edit/reply/read/delete, forced sync failure/recovery, pending sends across routes, manual retry with newer typing, duplicate prevention, committed receipt visibility, membership/session rejection, changed-account assertions, mocked attachment/storage lifecycle, native synthetic-device WebRTC and responsive layouts. Live Object Storage/STUN/TURN and device installation are separate evidence boundaries. TypeScript, ESLint and `git diff --check` passed.

| Local Turbopack messaging, 12 sends | Before p50 / p95 | Final p50 / p95 |
| --- | ---: | ---: |
| Optimistic DOM availability | 21 / 55 ms | 23 / 49 ms |
| POST acknowledgement headers | 124 / 1,642 ms | 123 / 910 ms |
| Recipient DOM availability from send click | 1,933 / 2,477 ms | 976 / 1,249 ms |
| Aggregate transaction time | 12 / 29 ms | 18 / 34 ms |

The final warm recipient subset (11 sends after excluding the first) was 976/1,032 ms. These local batches are small and compiler warmth differed. Optimistic rendering was already fast before this task; the confirmed sender changes are immediate composer availability, persistent pending state and reliable confirmation/retry. No database or acknowledgement latency speedup is claimed. Canonical acknowledgement adds a bounded read inside the same transaction and increases the decoded JSON body from the original ID-only shape (45 bytes by serialization) to a measured 431/432 bytes p50/p95 for these fixtures; compression and headers are excluded. It removes waiting for a later sync to obtain canonical message data. Final sender request counts over the 12-send experiment were 21 sync, zero RSC and 32 other API requests, versus 20/zero/49 before; differing experiment duration and background work preclude treating those counts as a per-minute usage reduction.

Final sanitized send-request spans across 12 samples were: authentication 4/8 ms, rate-limit 11/23 ms, validation 0/1 ms, insert 2/7 ms, commit 3/11 ms and pool acquisition 1/2 ms, each p50/p95. They measure local stages, not Neon or Vercel, and must not be summed as percentiles. Logger output is JSON containing only the established fixed-label/numeric/ephemeral-ID contract. Browser measurement inspects synthetic content only to observe DOM availability; content and private identities are never exported in measurement output.

The additional Turbopack mobile/navigation run with 150 ms emulated latency and bounded throughput passed the same history, draft, pending-send, viewport, membership and expiry checks. Its ten warm visited switches measured 31/38 ms p50/p95 with zero RSC requests and zero shell remounts; its single uncached first switch was 683 ms. These are emulated browser results, not physical mobile or installed-PWA measurements.

## Verification resumed on 2026-10-22

The five implementation milestones (`9cc59ea`, `be7de54`, `78f7c7d`, `7bc059c`, `e5963c5`) were already committed when this run began. The pending hardening and regression changes described above were reviewed and verified rather than repeating those implementations. The complete isolated PostgreSQL 16/Turbopack/Chrome suite again passed **214 tests**, skipped **2**, and failed none. TypeScript, lint and the production Webpack build passed; the build required execution outside the restricted sandbox. The two skips remain the PostgreSQL 17 grant-security fixture and the separately hosted runtime-browser regression. A sandbox-only test invocation stalled and was stopped; the completed suite used explicit disposable loopback infrastructure. No production database was substituted.

This full-suite rerun recorded ten warm cached switches at **22/24 ms p50/p95**, zero RSC requests, zero shell remounts and zero document reloads. Its single uncached switch was 332 ms; this is not evidence of an uncached speedup. Twelve sends recorded optimistic DOM **23/45 ms**, response headers **128/862 ms**, recipient DOM **783/1,205 ms**, and aggregate transaction time **29/118 ms**, each p50/p95. These are new local samples, not replacements for the earlier baseline or production percentiles.

The browser harness now separately observes the first `sent`/`read` DOM state, including delivery-attribute changes, rather than treating HTTP headers as a rendered confirmation. A separate passing 12-send run measured:

| Stage | p50 | p95 |
| --- | ---: | ---: |
| Optimistic DOM from click | 23 ms | 148 ms |
| POST response headers from request start | 87 ms | 806 ms |
| Confirmed DOM from click | 113 ms | 815 ms |
| Recipient DOM from click | 982 ms | 1,114 ms |
| Aggregate transaction | 10 ms | 50 ms |
| Server insert span | 2 ms | 7 ms |
| Server commit span | 3 ms | 18 ms |

Confirmation may also arrive through an authorized snapshot; it is never inferred from the optimistic bubble. The optimistic p95 exceeded 100 ms in this batch, so consistent under-100-ms feedback is not established. Compilation, host contention and network scheduling vary between batches; no database speedup is claimed. Acknowledgement bodies remained 431/432 decoded bytes p50/p95. Sender requests were 18 sync, zero RSC and 31 other API calls over that experiment, not a per-minute usage estimate. Compressed route bundles and production database usage were not measured.

The additional passing navigation regression with 150 ms emulated latency measured ten cached switches at **28/43 ms p50/p95**, zero RSC requests and zero shell remounts. Its single uncached switch was 963 ms. History, drafts, pending sends, membership rejection, session expiration and mobile viewports passed; this is browser emulation, not installed Android evidence.

The linked Ably free-plan/capability, Pusher pricing/private authorization and Vercel WebSocket documentation was rechecked on 2026-10-22. The transport evaluation remains applicable; no provider was provisioned. Native Vercel WebSocket support does not remove function-duration or cross-instance coordination requirements.

## Required production verification

No additional service, dependency, environment variable, schema migration or provider configuration is required. Existing opt-in performance flags remain optional. No push transport is implemented. Live Neon PostgreSQL/Object Storage, Vercel deployment regions, provider cold starts, TURN, operating-system background scheduling and physical installation were not exercised. A local PostgreSQL 16 server was unpacked and run only under `/tmp`; it is not production or Neon proof. The PostgreSQL 17-specific grant-security fixture must be run separately on its required version; no version guard is weakened.

After manual deployment, compare cold and warm visits separately on the same network/device. Gather at least 30 active two-account sends and report click-to-local-display, response-confirmed, recipient-display and database spans separately; collect only numeric timings, fixed request categories and ephemeral diagnostic traces. Test simultaneous sends, deliberate response loss after commit, manual retries with newer typing, membership/session rejection, account changes, long idle/foreground recovery, rapid cached/uncached back/forward, attachments and active calls. Confirm the service worker still caches only the public offline document. Measure real compressed route transfer sizes and function/database usage before changing polling or choosing a push service. Check Vercel and Neon region alignment privately and measure a naturally idle Neon wake-up; do not add a keep-awake job. On Android, check hardware back, keyboard/IME resize, native installation, media and offline/foreground recovery. Disable opt-in logging after collecting the evidence. Nothing is pushed or deployed by this task.
