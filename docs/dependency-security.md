# Dependency security review — 2026-10-22

## Final audit refresh — 2026-10-23

The final full registry audit also identified moderate
[GHSA-rxp7-6hxx-x8q5](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-rxp7-6hxx-x8q5)
in development-only `ip-address@10.7.2`, reached through shadcn's SOCKS and
express-rate-limit dependencies. The maintainer fixes quadratic IPv6 zone parsing
in **10.7.4**. A targeted lockfile refresh updates only that package and its
references within the parents' declared ranges; no direct dependency, override,
application feature or provider is added. Earlier audit snapshots below describe
their original review and are not the current full-audit result.

Frozen installation with lifecycle scripts disabled passes. Both SOCKS and
express-rate-limit resolve 10.7.4; valid IPv6 and zone inputs still validate,
and each path rejects the advisory's 100,000-percent-character plus newline input
in approximately 1 ms locally. The refreshed production audit reports no known
vulnerabilities; the full audit now reports only the existing high `braces` finding.

The unresolved high `braces` tooling advisory and ESLint support limitation remain.
See the [final handoff](production-readiness.md) for current application verification
and the separate production/device acceptance requirements.

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

These items were identified from the maintainer bulletin even though the initial pnpm audit did not report them. Some initial browser fetches of individual Next/React GHSA pages returned 404; the subsequent [Next maintainer advisory API](https://api.github.com/repos/vercel/next.js/security-advisories) and [React maintainer advisory API](https://api.github.com/repos/react/react/security-advisories) confirmed the affected/patched ranges. No hostile exploit was sent to production.

Framework milestone: 132 standard tests passed (17 gated skips), lint passed and the Webpack production build, including TypeScript and page generation, passed under Node 24.22.1. No application compatibility edits were required at this milestone.

## Transitive findings and reachability

The initial full pnpm audit reported **3 high and 2 moderate** advisories. All four MCP SDK findings came through the development dependency `shadcn@4.21.0 > @modelcontextprotocol/sdk@1.31.0`. A targeted `pnpm update @modelcontextprotocol/sdk --depth 100` resolves **1.32.1**, inside the existing parent's `^1.26.0` range, without a shadcn feature update or override. The official patched floor for these four findings is **1.32.0**.

| Advisory | Severity | Trigger / ChatBit reachability |
| --- | --- | --- |
| [GHSA-22jm-h49p-29qw](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-22jm-h49p-29qw) | High | Shared experimental task store crosses sessions. No ChatBit MCP server/task store; only the development CLI dependency. |
| [GHSA-6prh-2h8m-c8cw](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw) | Moderate | HTTP/OAuth cross-origin redirects forward sensitive data. Potential CLI MCP client surface, absent from application routes. |
| [GHSA-46jr-4wx8-v453](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453) | High | HTTP validation exhausts memory. No application MCP HTTP listener; relevant if the CLI's MCP server is explicitly started. |
| [GHSA-rvq5-wwqv-78pq](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-rvq5-wwqv-78pq) | Moderate | Bearer tokens lack resource binding. No application SDK bearer middleware; do not expose development MCP tooling as a public service. |
| [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | High | `braces@3.0.3` nested glob parsing can exhaust the stack. Remains unresolved; details below. |

Maintainer review also found [Undici 7.30.1 security fixes](https://github.com/nodejs/undici/releases/tag/v7.30.1) absent from the initial registry audit. The starting CLI tree has `shadcn` and `@dotenvx/dotenvx > undici@7.30.0`. These are separate from Node's built-in fetch, patched through Node 24.22.1 (bundled Undici 7.30.1). No application code imports npm Undici or its interceptors. CLI outbound HTTP is a potential exposure; optional interceptor triggers were not established in ChatBit.

| Advisory / CVE | Trigger |
| --- | --- |
| GHSA-qrxm-fqhp-jwvm / CVE-2026-87018 | TLS renegotiation crash |
| GHSA-2m5v-pch6-74hx / CVE-2026-109383 | Agent drops TLS callbacks |
| GHSA-4w7w-5xrc-9h26 / CVE-2026-109829 | Redirect/cache interceptor disclosure |
| GHSA-xjj6-f33q-929c / CVE-2026-109869 | Excess content-encoding crash |
| GHSA-55wc-3pg8-jfw6 / CVE-2026-87029 | Decompress interceptor crash |
| GHSA-f72v-6w45-q472 / CVE-2026-109841 | Mixed-case SRI bypass |
| GHSA-4qv8-2p9j-2685 / CVE-2026-109924 | EventSource memory growth |
| GHSA-9fm3-97px-rjf6 / CVE-2026-109932 | WebSocket PONG buffer growth |

`pnpm update undici --depth 100` resolves **7.30.1** within the existing CLI ranges. Both npm Undici paths and Node's bundled copy now meet the patched floor; no new override was needed. Node types move from **20.19.43 to 24.19.2** to match runtime APIs. The CLI version smoke test, TypeScript, lint, frozen installation and 132 standard tests passed (17 gated skips). The full audit now reports **one high** (`braces`); production audit reports **zero known findings**. This does not establish absence of vulnerabilities.

## Installed version inventory

These are actual resolved versions, not just manifest lower bounds. Every direct dependency and the complete lockfile were included in the registry audit. Published maintainer advisory APIs were additionally checked for Next, React, AWS SDK, Ably, node-rs, node-postgres, sharp, Zod, Base UI, Tailwind, TypeScript, shadcn, ESLint and Undici. An empty published advisory list is not proof that a package is safe.

| Package | Before | After / decision |
| --- | --- | --- |
| Node.js | 24.21.0 | 24.22.1 |
| pnpm | 12.3.4 | Retained; compatible, no applicable published advisory |
| next / eslint-config-next | 16.3.8 | 16.4.2 |
| react / react-dom | 19.2.8 | 19.2.9 |
| @types/node | 20.19.43 | 24.19.2 |
| @modelcontextprotocol/sdk (transitive) | 1.31.0 | 1.32.1 |
| undici (transitive npm package) | 7.30.0 | 7.30.1 |
| @next/env, @next/eslint-plugin-next, all eight optional @next/swc platform packages | 16.3.8 | 16.4.2 |
| undici-types (Node type dependency) | 6.21.0 | Adds 7.24.6 for Node 24 types; 6.21.0 remains for other Node 20 type consumers |
| @aws-sdk/client-s3, s3-presigned-post, s3-request-presigner | 3.1152.0 each | Retained; no actionable finding in resolved tree |
| @base-ui/react | 1.8.0 | Retained |
| @node-rs/argon2 | 2.2.2 | Retained |
| ably | 2.29.0 | Retained |
| class-variance-authority | 0.7.1 | Retained |
| cn | 0.2.6 | Retained |
| dotenv | 18.0.4 | Retained |
| lucide-react | 1.48.0 | Retained |
| pg / @types/pg | 8.23.1 | Retained |
| react-icons | 5.7.0 | Retained |
| server-only | 0.0.1 | Retained |
| sharp | 0.35.5 | Retained; already patched, Linux libvips package 1.3.4 |
| tw-animate-css | 1.4.0 | Retained |
| zod | 4.6.5 | Retained |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | Retained |
| @types/react / @types/react-dom | 19.3.0 | Retained; no new React 19.3 runtime APIs introduced |
| eslint | 9.39.5 | Retained; maintenance limitation below |
| shadcn | 4.21.0 | Retained; targeted transitive updates suffice |
| typescript | 5.9.3 | Retained; within typescript-eslint's supported range; no unnecessary major |

The [AWS advisory GHSA-6475-r3vj-m8vf](https://github.com/aws/aws-sdk-js-v3/security/advisories/GHSA-6475-r3vj-m8vf) affects `@smithy/config-resolver <4.4.0`; that package is absent from this resolved tree. The [sharp maintainer advisories](https://github.com/lovell/sharp/security/advisories) have patched floors at or below 0.35.5, already installed. The existing targeted `source-map-js@1.2.2` override for GHSA-68fv-2mgg-jv7q remains. Other available feature releases were not taken merely because they are newer.

## Remaining limitations

**The full audit remains nonzero.** `braces` has no published fixed version: the maintainer/database list all releases through 3.0.3 as affected. Paths are `eslint-config-next > @next/eslint-plugin-next > fast-glob@3.3.1 > micromatch@4.0.8 > braces` and `shadcn > fast-glob@3.3.3 > micromatch > braces`, including shadcn's `ts-morph > @ts-morph/common` path. No application route imports these glob parsers or passes request data into them; they remain build/development tooling. Use only trusted CLI/config glob patterns, run untrusted changes in isolated CI without production secrets, and recheck upstream for a published fix. No advisory suppression, severity change, blanket override, fabricated fixed version or unreviewed parser fork is used.

**ESLint 9 is end-of-life**, per the [official support policy](https://eslint.org/version-support/). Latest ESLint 10 is outside the latest published peer ranges for `eslint-plugin-react@7.37.5` (`^9.7` maximum), `eslint-plugin-jsx-a11y@6.10.2` (`^9` maximum) and `eslint-plugin-import@2.32.0` (`^9` maximum), all required by Next's config. ESLint 9.39.5 is retained as a documented maintenance limitation, not described as supported or vulnerability-free. Removing these checks, ignoring peer constraints or forcing the major would undermine a compatible verification toolchain. Revisit when upstream plugins support ESLint 10; no paid extended-support service was purchased.

## Application verification correction

The first expanded integration run exposed an existing session-expiry timer edge case: the private panel mounted, but remained visible when all authenticated API requests were stalled. The one-shot client timer checked `Date.now()` once; an early callback or fractional server deadline could leave it before expiry without another scheduled check. A small scheduler now rounds remaining delays upward and rechecks until the deadline, keeps one bounded timer, and cancels on disposal. Foreground checks use the same scheduler. Server-side session expiry and every API authorization check remain unchanged and authoritative.

Three deterministic unit cases cover fractional deadlines/early callbacks, clock changes/foreground checks/disposal and already-expired sessions. The existing real Chrome stalled-API expiry test passed after the correction; TypeScript, lint and the Webpack production build passed. This is a correctness issue discovered during validation, not proof that the dependency update introduced it.

Two navigation fixture races were also corrected: URL changes can precede React's active-link commit, so the mobile assertion now waits for the active Contacts link; membership synchronization can remove a sidebar link before a synthetic click, so the cached-conversation authorization check navigates through native history. Authorization-denial and private-content-removal assertions are preserved.

## GitHub Actions and Vercel configuration

The workflow reads `.nvmrc` for application Node and retains pnpm 12.3.4. Embedded action runtimes also move to Node 24 using [checkout v5](https://github.com/actions/checkout/releases/tag/v5.0.0), [setup-node v5](https://github.com/actions/setup-node/releases/tag/v5.0.0), [pnpm/action-setup v5](https://github.com/pnpm/action-setup/releases/tag/v5.0.0) and [upload-artifact v6](https://github.com/actions/upload-artifact/releases/tag/v6.0.0). Artifact v5 still declares Node 20, hence v6 is the minimal runtime update there. Official action manifests and existing input names were checked, and workflow YAML, read-only repository permissions and version inputs were validated locally. These Node 24 actions require Actions Runner 2.327.1 or later; the workflow uses GitHub-hosted `ubuntu-latest`. No remote Actions run is claimed.

No new Vercel environment variables, migrations or provider changes are required. Keep the project's Node selection at 24.x, preserve `packageManager`, use frozen pnpm installation and the existing Webpack build command, and inspect the actual Node patch and deployment commit after manual push/deployment. Vercel controls the Node patch rollout. Local `.nvmrc` does not replace the user's global Node installation: use `nvm install && nvm use` inside the repository.

## Final verification refresh

The existing update commits were rechecked against the installed tree and fresh official advisory metadata on 2026-10-22. Node 24.22.1 was downloaded again into a temporary directory and verified against the official release SHA-256 list. The global Node installation remains unchanged. A fresh frozen installation passed without lockfile changes. The standard suite passed **135 tests, 17 skipped**, including the three added session-expiry cases. TypeScript, ESLint, the Webpack production build and whitespace checks passed. The production Chrome smoke test passed **35 public route/viewport checks**, hydration/error checks, signup validation, light/dark/system themes, simulated install lifecycle, cache isolation and offline navigation.

A fresh full registry audit exits 1 for the single unresolved high `braces` advisory; the production audit exits 0 with zero known findings. The checked-in JSON retains the before/after advisory details. This audit does not prove the absence of other vulnerabilities. Official action manifests were refreshed and confirm Node 24 for all four selected action versions. Installed React, JSX accessibility and import plugins still exclude ESLint 10 in their peer ranges.


The expanded suite under Node 24.22.1 completed with **234 passed, 0 failed, 2 skipped** against disposable loopback PostgreSQL **17.10**, Turbopack and real headless Chrome. It enabled HTTP auth, navigation, optimistic SPA messaging, push-browser and native WebRTC checks. Coverage includes registration/login/logout and Argon2id, session cookies and expiry, authorization/security grants, PostgreSQL transactions, attachment/storage mocks and private access, message persistence/edit/reply/delete/idempotency, polling, cached navigation and drafts, responsive controls, profile/password changes, and synthetic-device audio/video exchange.

The two skipped cases were run separately and passed: the real Ably SDK with a loopback protocol fixture (**1 passed**) and the production first-paint theme/authentication-outage recovery browser regression (**1 passed**). The latter intentionally used an unreachable loopback database and confirmed valid-format cookies produce a server error during an outage, preserving fail-closed behavior without script/hydration warnings. No live Neon database/storage, hosted Ably service, TURN relay, physical camera/microphone, real-device install, Vercel deployment or remote GitHub Actions acceptance is claimed. The disposable PostgreSQL server is stopped after validation.
