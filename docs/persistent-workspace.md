# Persistent workspace and push delivery

## Deployment evidence

On 2026-10-22 the user identified `https://chat-bit-rouge.vercel.app` as production, but its deployed commit is **not independently verified**. Local starting revision is `892cb60`. No production latency cause or resolution is established. The user will check the active Vercel deployment commit manually; this work does not push, deploy or modify production data.

## Persistent workspace

The previous shell persisted, but Calls, Contacts and Settings still depended on destination RSC navigation and their page components remounted. Only visited conversations could use the private RAM path. The shell now owns four bounded, account-keyed workspace panels. Each mounts on its first selection and remains mounted while hidden. Native Next.js history integration selects a panel immediately, including first visits, while calls history still displays honest loading until its authorized API returns. Settings subsection state, form edits and call search/history survive tab changes. Uncached conversation URLs and shared files retain normal authorized App Router navigation. Direct section loads still pass server authentication and SSR the selected shell panel.

The real Chrome regression passed history, drafts, pending sends, membership rejection and session expiration. With **all fetches delayed by 1,500 ms**, 30 section switches measured destination-panel DOM readiness **13/22 ms p50/p95**, with **zero RSC requests**. Ten cached conversation switches measured 37/59 ms with zero RSC requests/remounts. This establishes network independence locally, not production speed or completion of uncached API data. TypeScript and lint passed. Earlier measurements and the original baseline remain in `spa-messaging-performance.md`.

## Immediate outgoing messages

The audited `892cb60` handler already enqueued text before awaiting an API; a network wait in that handler was **not** established as the production cause. Its asynchronous return and React scheduling did not explicitly guarantee a DOM commit before the handler returned. Text acceptance now returns a synchronous boolean, flushes the accepted pending bubble and empty composer together, and schedules outbox network work in a subsequent microtask. Editing and attachments retain their durable asynchronous workflows. Server acknowledgement, polling, failure/retry, stable submission IDs and pending state across conversations remain separate.

The isolated Chrome test now asserts that the matching pending bubble **and empty composer exist before the click handler returns**, with every POST deliberately delayed by 1,500 ms. The passing 30-send run also passed response-loss-after-commit, uncached navigation, manual retry, duplicate prevention, newer-draft preservation and changed-account rejection. A separate original `892cb60` checkout ran the same 30-send harness, bundler and delay:

| Stage, p50/p95 | Original | Updated |
| --- | ---: | ---: |
| Optimistic DOM from click | 48/217 ms | 43/90 ms |
| Response headers from request start, includes artificial delay | 1,589/2,628 ms | 1,581/1,663 ms |
| Confirmed DOM from click | 1,648/2,660 ms | 1,654/1,868 ms |
| Recipient DOM from click, polling | 2,091/3,843 ms | 2,033/2,213 ms |

Compiler/host contention differed, so this does **not** prove a database, acknowledgement or recipient-delivery speedup. The structural result is synchronous local acceptance independent of delayed POSTs. An earlier concurrent-build run measured 42/74 ms optimistic DOM but later timed out on uncached navigation; the complete 12-send reproduction and final 30-send run passed. The transient timeout's cause is unconfirmed. A 12-send rerun also had optimistic p95 116 ms; the 90 ms final p95 is not a universal device guarantee. Reproduce with `TEST_SPA_SAMPLES=30 TEST_SPA_SEND_DELAY_MS=1500 TEST_SPA_SYNC_ACCEPTANCE=1` and the existing isolated SPA browser flags. Do not enable the new synchronous assertion on the original checkout.
