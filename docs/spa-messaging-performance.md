# SPA and messaging performance

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
