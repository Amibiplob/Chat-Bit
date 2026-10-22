# Dependency security review — 2026-10-22

## Runtime

The starting runtime was Node.js 24.21.0. Local development and CI now select **24.22.1** through `.nvmrc`; GitHub Actions reads that file. The official [Node.js release](https://nodejs.org/en/blog/release/v24.22.1) and [October security bulletin](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) identify the latest available Node 24 LTS security patch on the review date. Local validation uses an official Linux binary checked against the release SHA-256 checksum, without replacing the user's global runtime.

The runtime patch addresses CVE-2026-105482 (DNS NUL truncation), CVE-2026-105483/CVE-2026-106069/CVE-2026-106072 (TLS IP validation), CVE-2026-111497 (Brotli memory corruption), CVE-2026-105481 (HTTP agent response handling), CVE-2026-106074 (snapshot entropy caches), and CVE-2026-106073 (permission-model realpath bypass), plus bundled dependency/trust updates. ChatBit uses HTTPS, fetch and cryptographic IDs; no exploit against ChatBit was reproduced. It does not build startup snapshots/SEAs or rely on Node's permission model for application authorization.

`engines.node` remains `24.x`: [Vercel supports major-line selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and controls its own minor/patch rollout. A repository pin cannot prove the deployed runtime. After manual deployment, check build/runtime version evidence for 24.22.1 or a newer patched 24.x; no Vercel setting was changed remotely.

pnpm **12.3.4** is retained. It supports Node 24, and the published [pnpm maintainer advisories](https://github.com/pnpm/pnpm/security/advisories) inspected on this date affect older version ranges. Latest pnpm 12.14.0 is available, but no applicable security fix requires expanding this update. Existing lifecycle build denials and the targeted `source-map-js` security override remain intact.

Runtime milestone: frozen installation passed; standard suite passed 132 tests, with 17 infrastructure-gated cases skipped, under Node 24.22.1 before dependency changes.

## Framework security patches

Next.js and eslint-config-next move together from **16.3.8 to 16.4.2**. React and React DOM move together from **19.2.8 to 19.2.9**, retaining the existing React minor. The [October 14 Next.js bulletin](https://nextjs.org/blog/nextjs-security-update-october-14-2026) requires Next 16.4.1 or later; [16.4.2](https://github.com/vercel/next.js/releases/tag/v16.4.2) also contains Turbopack stability fixes. The [React 19.2.9 release](https://github.com/react/react/releases/tag/v19.2.9) updates the RSC transport protocol. Next supplies its own bundled RSC implementations for Webpack/Turbopack: they are updated with Next, not replaced through an override.

| Official advisory | Starting exposure and action |
| --- | --- |
| GHSA-673q-mjm6-r5xr / React GHSA-xqc2-xf4c-x3h3, critical cache typed-array RCE | Installed Next 16.3.8 predates the fix. No Cache Components or `use cache` functions were found, so the described application trigger was not found. Updated Next regardless, as recommended upstream. |
| CVE-2026-96889 / GHSA-2464-fhr4-w9xw, critical image/SVG memory corruption | Existing explicit sharp 0.35.5 already meets the upstream workaround; `dangerouslyAllowSVG` is not enabled. Retained sharp and upgraded Next's dependency floor. |
| GHSA-p3m5-59mp-jv5r / React GHSA-h3gv-c5rc-p453, high Server Action CPU exhaustion | Reachable framework surface: ChatBit App Router exposes `app/actions/auth.ts`. Upgraded Next/RSC handling; application authentication is not a substitute for the parser fix. |

These items were identified from the maintainer bulletin even though the initial pnpm audit did not report them. The individual linked Next/React GHSA pages returned 404 during review; no additional CVE identifiers or advisory details were inferred. No hostile exploit was sent to production.

Framework milestone: 132 standard tests passed (17 gated skips), lint passed and the Webpack production build, including TypeScript and page generation, passed under Node 24.22.1. No application compatibility edits were required at this milestone.
