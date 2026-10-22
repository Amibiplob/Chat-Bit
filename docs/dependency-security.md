# Dependency security review — 2026-10-22

## Runtime

The starting runtime was Node.js 24.21.0. Local development and CI now select **24.22.1** through `.nvmrc`; GitHub Actions reads that file. The official [Node.js release](https://nodejs.org/en/blog/release/v24.22.1) and [October security bulletin](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) identify the latest available Node 24 LTS security patch on the review date. Local validation uses an official Linux binary checked against the release SHA-256 checksum, without replacing the user's global runtime.

The runtime patch addresses CVE-2026-105482 (DNS NUL truncation), CVE-2026-105483/CVE-2026-106069/CVE-2026-106072 (TLS IP validation), CVE-2026-111497 (Brotli memory corruption), CVE-2026-105481 (HTTP agent response handling), CVE-2026-106074 (snapshot entropy caches), and CVE-2026-106073 (permission-model realpath bypass), plus bundled dependency/trust updates. ChatBit uses HTTPS, fetch and cryptographic IDs; no exploit against ChatBit was reproduced. It does not build startup snapshots/SEAs or rely on Node's permission model for application authorization.

`engines.node` remains `24.x`: [Vercel supports major-line selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and controls its own minor/patch rollout. A repository pin cannot prove the deployed runtime. After manual deployment, check build/runtime version evidence for 24.22.1 or a newer patched 24.x; no Vercel setting was changed remotely.

pnpm **12.3.4** is retained. It supports Node 24, and the published [pnpm maintainer advisories](https://github.com/pnpm/pnpm/security/advisories) inspected on this date affect older version ranges. Latest pnpm 12.14.0 is available, but no applicable security fix requires expanding this update. Existing lifecycle build denials and the targeted `source-map-js` security override remain intact.

Runtime milestone: frozen installation passed; standard suite passed 132 tests, with 17 infrastructure-gated cases skipped, under Node 24.22.1 before dependency changes.
