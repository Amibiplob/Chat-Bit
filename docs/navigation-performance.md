# ChatBit navigation performance

This records the earlier navigation milestone. For the subsequent private conversation cache, nonblocking outbox, canonical acknowledgements and bounded polling changes, see [SPA and messaging performance](spa-messaging-performance.md).

## Initial audit

The baseline is commit `7a211d7`. There is one HTML root layout and one shared authenticated `(app)` layout, covering chats, conversations, contacts, calls, shared files and settings/profile. Theme and install providers are above route groups. Public/authenticated route groups do not define competing HTML roots.

Internal document navigation was not the confirmed cause. Existing conversation/mobile links already use `next/link`; desktop section buttons use `router.push`. Logout remains a server action with session revocation/redirect. Attachment downloads intentionally navigate to an authorized download response; those URLs must not be routed through Next.js or prefetched.

Confirmed opportunities:

- Creating a conversation calls `router.push` and immediately `router.refresh`, causing an additional refresh of shared server data.
- Desktop section buttons have no link-native pending feedback or prefetch behavior.
- Conversation links use viewport prefetch across the whole private list.
- Route branches unmount the conversation sidebar when opening settings, contacts, shared files or calls, losing search/filter/list scroll state.
- The realtime effect depends on conversation identity and recreates its polling loop/listeners at route changes. An incoming thread registration also requests a forced snapshot.
- Conversation components are keyed by conversation ID, correctly isolating message data, but composer text and message scroll state are discarded on unmount.
- Existing dynamic viewport height, safe-area padding, inline media previews and offline-only service worker already support mobile PWA use. The service worker must continue to exclude private data and RSC/API caching.

Local baseline measurements and final verification will be recorded below. No production data is used for browser fixtures.

## Implemented behavior

1. **Client navigation:** desktop section buttons now use real Next.js links, preserving keyboard/modified clicks, URLs and history. A fixed-position pending hint from `useLinkStatus` gives immediate feedback without shifting content or delaying clicks. Mobile and conversation links share that feedback. Conversation-list links disable viewport prefetch, preventing an unbounded list of private dynamic route requests. The small fixed section navigation retains Next.js automatic partial prefetch/loading behavior. Creating a conversation no longer immediately refreshes the entire shared server tree after pushing its URL.
2. **Persistent shell:** the existing shared authenticated layout remains the security boundary; SSR and its concurrent initial settings/conversation reads remain intact. The conversation sidebar stays mounted but hidden outside chat sections, retaining search, filters and its scroll position. Mobile navigation also remains mounted while hidden during a conversation/call. A stable content container replaces route-specific wrapper branches. Theme, settings and calling providers retain their existing shared placement. The sidebar is memoized so unrelated call-state renders do not recompute its filtered list.
3. **Realtime selection:** one loop and one set of foreground/network listeners remain mounted. Selection forces a fresh authorized snapshot without resetting connection status. Obsolete requests are aborted on a different conversation selection; queued refreshes coalesce, stale snapshots are fenced, and real failures/session rejection retain recovery behavior. Activity uses the current committed conversation and monotonic sequence, avoiding a leave/new-heartbeat pair on every route change. Poll intervals were not shortened.
4. **Private view state:** up to 20 conversations retain text drafts and numeric scroll positions in account-scoped memory. Each draft is capped at 10,000 characters. Send locks and retry IDs survive route changes, preventing repeated submission while a previous acknowledgement is pending and preserving idempotency on retry. Failed sends keep drafts; confirmation clears a matching draft without removing different newer text. Typing subscribes only the composer to its draft, not the shared shell or message list. Pending entries are protected from eviction.
5. **Loading/mobile:** route-specific loading boundaries cover conversations, contacts, settings, shared files and call history. Placeholders show actual pending work; no fake successful state is added. Conversation message components remain keyed by identity. Message scroll restoration is separate from document history, and existing dynamic viewport/safe-area sizing remains in place. No new animation delays were added.

The view store has no module-global private cache, browser storage, service worker storage or shared server cache. It stores no message pages, media, file objects or attachment URLs. It is keyed by authenticated user at the provider boundary and disappears when that private layout is discarded or the document reloads. Eviction of an older inactive entry loses its draft/scroll/retry metadata by design. Reply/edit target context and selected files are not retained across chat unmounts; an upload still aborts on unmount. Scroll is restored within the newly authorized message window; previously paginated messages are not cached, so a position outside that window can clamp to its available range.

No unnecessary document reload was found or removed: the baseline already recorded zero. The removed `router.refresh` was a redundant **RSC refresh**, not a document reload. Session revocation, mutation-related profile/security refreshes and authorized attachment downloads retain their intentional behavior. No schema, backend provider, dependency, polling interval, live database row, storage object or deployment setting was changed.

## Measurements and interpretation

Experiments use real Next.js and Chrome with synthetic users in a disposable loopback PostgreSQL schema. No production data or provider credentials are used. A browser wrapper classifies fetches into fixed request categories and records numeric durations/counts only. DOM references check shared-shell/sidebar persistence without logging identities. A MutationObserver records when pending feedback enters the DOM; this measures DOM feedback availability, not display hardware paint latency. Destination readiness requires the matching conversation header plus its hydrated composer. Observation is sampled at roughly 200 ms, so readiness values have that observation granularity.

| Webpack development experiment | Original `7a211d7` | Updated implementation |
| --- | ---: | ---: |
| Initial measured chat switch, destination readiness | 2,724 ms | 2,299–3,324 ms across isolated and broader-suite runs |
| Initial switch, DOM loading feedback | 2,526 ms | 8–46 ms in those runs |
| Return switch, destination readiness | 223 ms | 229–246 ms |
| Return switch, DOM feedback | Not observed before completion | 2–17 ms |
| RSC fetches per measured transition | 1 | 1 |
| Initial switch, sync / other API fetches | 2 / 3 | 2–3 / 2 |
| Return switch, sync / other API fetches | 1 / 2 | 1–2 / 1 |
| Shared-shell remounts / document reloads | 0 / 0 | 0 / 0 |
| Draft restored on return | No | Yes |
| Sidebar preserved through settings | No | Yes |

These are individual local samples, not p50/p95 or controlled production benchmarks. Initial development navigation includes compiler/chunk/network effects and varied substantially; **no consistent destination-data speedup is claimed**. Warm destination readiness was essentially unchanged. Immediate feedback and state retention are the confirmed UX improvements. Sync counts include background polls and forced snapshots, so these short windows do not prove a universal reduction in total requests or SQL calls. Other API counts decreased in these samples; no database-query execution speedup is claimed. Authorization remains necessary on destination requests.

The initial exploratory harness misclassified URL-object RSC fetches; its zero-RSC counts are excluded. The corrected original sample is the baseline above. Turbopack development is tested separately and must not be compared against Webpack timing as an application-only speedup. Its unthrottled final pre-verification sample recorded 1,113 ms destination readiness and 7 ms DOM feedback, then 243 ms / 4 ms on return.

## Reproduction and safe verification

The browser test hard-rejects non-loopback `TEST_DATABASE_URL` values. It creates/drops a unique schema, launches an isolated development build under `.next/auth-http-test`, uses genuine sessions and authorized message APIs, and shuts down its application process. No environment file is edited. Set an explicitly disposable local database before running it:

```sh
TEST_DATABASE_URL=postgresql://LOCAL_TEST_ROLE@127.0.0.1:LOCAL_TEST_PORT/LOCAL_TEST_DATABASE \
CHROME_BIN=/opt/google/chrome/chrome TEST_NAVIGATION_BROWSER=1 \
node --test --test-isolation=none tests/navigation.browser.test.mjs
```

Add `TEST_NEXT_TURBOPACK=1` for Turbopack development. Add `TEST_NAVIGATION_LATENCY_MS=150` to simulate network latency with bounded transfer throughput. `TEST_NAVIGATION_BASELINE=1` records older behavior without requiring the new draft/sidebar assertions; use it only on the original revision, without mixing old and new application files or a shared development build. The original sample was taken before implementation. For reproducible comparisons, use separate checkouts/build directories, the same bundler, browser version, viewport and database fixtures; warm compilation separately and gather multiple samples.

The full database suite can run with that isolated `TEST_DATABASE_URL` and `TEST_DATABASE_SSL=disable`. `TEST_AUTH_HTTP=1` plus `CHROME_BIN` enables the existing HTTP/forms/two-browser suite. Native calling also has its independent `TEST_CALLING_BROWSER=1` fixture. Never use a live Neon URL for any mutating integration test.

The broader suite found an old mocked peer that reported connected transport without a remote track. The mock now emits a cloned synthetic audio track to satisfy the existing media-ready connection contract. Native WebRTC remains a separate test; its success is not inferred from the mock.

## Remaining limits and production verification

### Verification rerun on 2026-10-21

The checkout already contained the first three milestone commits and the measurements above when this verification resumed. Those timings are earlier recorded samples, not newly reproduced measurements. This environment has PostgreSQL client tools but no local PostgreSQL server executable; authenticated navigation/HTTP/database fixtures were therefore skipped. No live database was substituted. Client JavaScript bundle changes and SQL request counts were not measured in this rerun.

The current `pnpm test` run passed 118 tests and skipped 14, with no failures. TypeScript and ESLint passed. `pnpm build` passed outside the restricted sandbox; inside it Next.js could not capture TypeScript configuration output. Local servers also required execution outside the sandbox because loopback listening was denied. The isolated native Chrome WebRTC check passed with one offer, one answer, three ICE signals and one remote track per peer (2,267 ms readiness in this sample; not a navigation measurement).

The production public browser script subsequently passed all 35 route/viewport checks, signup validation, theme changes, simulated install lifecycle, offline navigation and the assertion that only the public offline document is cached. The Turbopack-compatible runtime browser test also passed rendering, first-paint themes and fail-closed recovery. Native device installation remains untested.

Production Chrome passed first-paint light/dark/system themes, public rendering, hydration and intentionally unavailable-database recovery. The general public browser script reached its service-worker assertion in Turbopack after its 35 route/viewport checks and form validation, then timed out because registration is intentionally production-only. Use production mode for the install/offline portion; this development timeout is not an authenticated-navigation result. The added browser scenarios for history, preserved scroll, pending-send remounts, shortened mobile viewports and expiry are syntax-checked but require the missing disposable database before their new assertions can be considered verified. The realtime cancellation regression and bounded draft-store tests pass independently.

- Authenticated production navigation and Vercel/Neon latency were not measured. Authenticated Chrome regression uses local PostgreSQL in development; the production build's guard against local production database endpoints remains intact. Production Chrome tests use public routes, signed-out protection and deliberate invalid configuration for fail-closed recovery, not live accounts.
- Text drafts survive compatible in-app transitions, not reloads, logout/account changes, another tab or eviction from the bounded store. Drafts are never advertised as server-saved.
- Emulated small mobile/tablet/desktop viewports and a shortened keyboard-sized viewport are browser evidence. They do not prove Android hardware back, physical keyboard/IME behavior, native installation or OS background scheduling.
- Browser polling, permission/network delays, provider wake-up/cold starts and geographic round trips still apply. Existing WebRTC provider/controller placement is preserved; no STUN/TURN or paid-service change was made.

After manual deployment, enable the existing opt-in timing (`localStorage['chatbit.performance']='1'`, then reload; server `CHATBIT_PERFORMANCE=1` only for an approved short window). Record first usable conversation, cold/warm navigation and pending feedback separately. Observe only numeric counts/durations: do not export HAR, private URLs, message text, session values or storage links. Compare at least ten warm transitions and naturally idle first visits separately, on the same network/device. Inspect whether shared layout, sidebar, polling and active calls remain intact across sections; test rapid A/B switches, back/forward, pending-send navigation, attachments, session expiry and installed PWA recovery. Verify private responses are never service-worker cached. Review the actual deployment region/provider timing privately before attributing remaining waits to database or serverless cold starts. Disable diagnostics after the observation window. No push or deployment is performed by this task.
