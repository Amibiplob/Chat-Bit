# Persistent workspace and push delivery

## Deployment evidence

On 2026-10-22 the user identified `https://chat-bit-rouge.vercel.app` as production, but its deployed commit is **not independently verified**. Local starting revision is `892cb60`. No production latency cause or resolution is established. The user will check the active Vercel deployment commit manually; this work does not push, deploy or modify production data.

## Persistent workspace

The previous shell persisted, but Calls, Contacts and Settings still depended on destination RSC navigation and their page components remounted. Only visited conversations could use the private RAM path. The shell now owns four bounded, account-keyed workspace panels. Each mounts on its first selection and remains mounted while hidden. Native Next.js history integration selects a panel immediately, including first visits, while calls history still displays honest loading until its authorized API returns. Settings subsection state, form edits and call search/history survive tab changes. Uncached conversation URLs and shared files retain normal authorized App Router navigation. Direct section loads still pass server authentication and SSR the selected shell panel.

The real Chrome regression passed history, drafts, pending sends, membership rejection and session expiration. With **all fetches delayed by 1,500 ms**, 30 section switches measured destination-panel DOM readiness **13/22 ms p50/p95**, with **zero RSC requests**. Ten cached conversation switches measured 37/59 ms with zero RSC requests/remounts. This establishes network independence locally, not production speed or completion of uncached API data. TypeScript and lint passed. Earlier measurements and the original baseline remain in `spa-messaging-performance.md`.
