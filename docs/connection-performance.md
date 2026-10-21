# Connection latency investigation — 2026-10-21

## Evidence and limits

The observed production symptom is the operator's report. No authenticated production browser session or Vercel dashboard was available. Local tests do not establish production p50/p95, Neon compute wake-up, serverless cold starts, regional alignment, STUN behavior or cross-network connectivity.

Confirmed in the original code:

- Calls slept a full 3,000 ms when idle or 1,000 ms while live **after** processing each sync. HTTP and negotiation time added to the cycle.
- Starting/accepting a call did not wake that timer. Accept initialized the peer, then waited for the existing timer to discover the offer.
- The app layout awaited conversation loading before starting settings loading. Both paths independently authorize; settings do not depend on the conversation result.
- Messaging polling already starts immediately, runs single-flight, subtracts request duration, and forces recovery snapshots. WebRTC already uses trickle ICE and buffers early remote candidates. Neither needed replacement.
- Session verification already uses React request memoization. The PostgreSQL pool is shared within each warm Node instance. This is not a pool shared across all Vercel instances.

## Measurements

| Experiment | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Injected 400 ms idle sync, controller timer | 3,400 ms start-to-start | 3,000 ms start-to-start | Rest changed from 3,000 to 2,600 ms; no overlapping requests |
| Native Chrome voice setup to both unmuted remote tracks | 4,034 ms | 2,109 ms | One comparable run per revision; fake microphones, loopback, in-memory signaling, no STUN servers or database |
| First pool acquisition from this workstation | — | 348.8 ms | Includes initial connection/TLS; probe followed readiness checks, so this is **not** a suspended-compute wake-up measurement |
| Reused pool acquisition | — | 0.3 ms | Same process, same pool |
| Read-only `SELECT 1`, first/reused | — | 52.3 / 52.0 ms | Network plus query, not server execution time in isolation |

The Chrome fixture wakes the receiver after call creation in both versions, then lets the caller use its normal timer after acceptance. It asserts one offer, one answer, trickled candidates and remote tracks at both peers. It does not measure normal idle incoming-call discovery or browser permission decisions. The original sample used the controller from the parent of `5aea4b3`. Timings are single samples, not statistical guarantees. The initial exploratory browser comparison manually woke the caller and used different media-readiness conditions; those samples are excluded above.

No before/after millisecond result is claimed for layout parallelism. The deferred-response regression verifies settings start before conversations return, after authentication succeeds.

The existing read-only readiness tool passed on both configured endpoints: connection, migration checksums, table security and runtime ownership. Local configuration validation confirmed a pooled runtime endpoint, pool maximum 3, connection timeout 5 seconds, idle timeout 10 seconds and verified TLS. No database credentials, endpoint names or provider settings were logged or changed.

## Changes

Messaging startup loads settings and conversations concurrently after authentication. Initial message authorization/order, snapshots, read receipts, attachments and retry semantics remain in their existing paths. No messaging polling interval was shortened.

Call polling subtracts request/processing time from its existing 3-second idle and 1-second live targets, with a 500 ms minimum rest. Start/accept/end actions request a fresh sync. If a poll is already running, wake requests coalesce into one immediate follow-up; stale snapshots still obey mutation-version fences. Background behavior and server rate limits remain authoritative. Incoming discovery in an otherwise idle visible tab still has up to one nominal 3-second wait plus transport time.

Outgoing permission/API setup can be cancelled. Late media is stopped; a late successful create receives a compensating cancellation request. As with existing termination behavior, a lost cancellation request falls back to server lease expiry. Duplicate starts are suppressed. Calls show Connected only after SDP negotiation, connected transport and at least one unmuted remote track. This establishes incoming-track readiness, not audible speaker playback; the existing playback recovery button handles autoplay restrictions.

No TURN provider, schema migration, dependency, paid service, keepalive loop or production configuration change was added.

## Opt-in measurements

Browser, in the application's own DevTools console:

```js
localStorage.setItem('chatbit.performance', '1')
location.reload()
```

To disable, remove the `chatbit.performance` local storage entry and reload.

Server: set `CHATBIT_PERFORMANCE=1` explicitly for a controlled deployment window. It is off by default. Remove/disable it after collecting samples. This change does not set the deployment variable for you.

Events named `chatbit.performance` contain exactly `operation`, `stage`, `durationMs` and a fresh random `correlationId`. Labels are allowlisted. IDs are unrelated to users, sessions, messages or calls. No raw URLs, request/response bodies, SQL, SDP, ICE candidates, credentials or errors enter the logger. Browser output stays in the console; there is no telemetry upload endpoint. Client and server correlation IDs are independent; do not join them as an end-to-end trace.

- Page: initial load since navigation time origin; first usable hydrated conversation since initial load or the latest App Router transition. This includes the server-provided message window, even when it is empty.
- Server: request, authentication, database configuration, rate limiting, conversation list/initialization, initial messages, settings, transaction pool acquisition and database stages. Layout and conversation rendering have separate scopes. Authentication may be memoized and therefore absent in a second scope.
- Messaging: sync request duration, time to first applied snapshot, API duration and message creation acknowledgement (`delivery`). A creation acknowledgement does not establish receipt at the other browser.
- Calling: permission wait, create/accept, receiver discovery observation, ICE configuration, offer/answer/candidate writes, transport connected, remote media ready and connected acknowledgement. Lifecycle marks are cumulative from local start/discovery; steps are individual durations. Discovery is a receiver-local observation, not caller-to-receiver transit time. `ice-connected` uses the peer's aggregate connected transport state.

Nested spans overlap: do not sum them. Existing `Server-Timing` reports total app, transaction acquisition and transaction duration. Direct pool queries are included in enclosing authentication/rate-limit/database spans, not separately split into pool and query times. A transaction duration includes query round trips, not just PostgreSQL execution. Individual SQL execution plans were not collected or changed without evidence of a slow query.

For a bounded read-only connectivity probe:

```sh
node scripts/check-database.mjs
node scripts/measure-connection-latency.mjs
```

The latter performs two `BEGIN READ ONLY` / `SELECT 1` / `COMMIT` samples, then closes the pool. Run it manually, never as a timer to prevent idle suspension. It uses normal environment precedence and verified TLS for Neon and prints only sample labels/numeric durations.

## Verification and reproduction

Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and `git diff --check`. The native browser fixture can be enabled independently:

```sh
CHROME_BIN=/opt/google/chrome/chrome TEST_CALLING_BROWSER=1 node --test --test-isolation=none tests/connection.browser.test.mjs
```

For the original controller, export it to a temporary file and repeat the same test:

```sh
git show 5aea4b3^:lib/calling-client.mjs > /tmp/chatbit-calling-baseline.mjs
CHROME_BIN=/opt/google/chrome/chrome TEST_CALLING_BROWSER=1 TEST_CALLING_BASELINE_FILE=/tmp/chatbit-calling-baseline.mjs node --test --test-isolation=none tests/connection.browser.test.mjs
```

Regression coverage includes authenticated parallel startup, immediate messaging polling, ordering/deduplication, stale-response fences, foreground recovery, serialized call polling/wakes, SDP/early ICE, native trickle ICE, media readiness, signaling timeout, duplicate starts and cancellation during permission or call creation. Destructive database integration tests require an explicitly isolated `TEST_DATABASE_URL`; none were pointed at Neon. Only PostgreSQL client tools were installed here, so a disposable local server could not be started. Existing database/HTTP integration cases remain gated; local controller tests and native media tests are separate evidence.

Final verification: `pnpm test` with native Chrome enabled passed 114 tests with 12 gated integration cases skipped. TypeScript, ESLint, the Webpack production build and `git diff --check` passed. Restricted-sandbox subprocess attempts were superseded by successful permitted runs. The three implementation milestones are `5aea4b3`, `f608078` and `652bd94`; the verification milestone is recorded in Git history.

## Production verification after manual deployment

1. Enable opt-in timing for a short window. Use two authorized browsers/devices and normal user actions. Record numeric timings only; do not export HAR, SDP/ICE dumps or authenticated URLs.
2. Compare at least ten warm visits and separately record a first visit after natural inactivity. Do not generate background traffic to hold compute awake. Measure initial load, first usable conversation, first sync, session span, pool acquisition and database spans. Report counts and p50/p95 separately for each condition.
3. Send an approved test message and measure its creation acknowledgement and its appearance on the receiver separately. Check ordering, read receipts, attachments and foreground recovery. Avoid including message text or identities in timing notes.
4. Measure click-to-permission, creation, observed incoming notification, accept-to-offer/answer, transport and first remote-media readiness. Keep human permission/answer delay separate. Test cancellation before permission resolves, during create, ringing and setup, plus network failure.
5. Check the deployed Vercel function region and Neon compute region privately in their dashboards. No region pin exists in this repository, but dashboard settings are unknown. If they differ, choose an existing-plan region near the database and validate a preview before a separate authorized deployment. Do not infer geographic location from a private endpoint name.
6. Correlate naturally slow first requests with provider cold-start/compute activation observations. The current measurements do not prove either is the production bottleneck. Do not change pool limits or timeouts based on a single workstation sample.
7. Test installed PWA and browser tabs on same and different networks, including mobile data. The local native fixture proves neither STUN nor TURN traversal. Permission prompts, browser scheduling, network round trips, idle incoming polling and compute activation can still add delay.

[Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero) documents idle compute suspension. [Vercel region guidance](https://vercel.com/docs/functions/configuring-functions/region) explains why functions should run near their data source. [WebRTC TURN guidance](https://webrtc.org/getting-started/turn-server) explains relay requirements where direct peer connectivity is unavailable. STUN alone cannot guarantee cross-network calls; no free-tier workaround in this change removes that limitation.
