# Production-readiness audit — 2026-10-16

**Release decision: BLOCKED for public production use.** Local verification does
not establish live storage durability, cross-network calling, scheduler delivery,
deployed TLS or hosting capacity. No application migration, push or deployment
was performed. Account deletion remains clearly unavailable.

Status vocabulary: **PASS** = verified with the stated evidence; **BLOCKED** =
missing infrastructure/access; **FAIL** = confirmed unresolved issue;
**NOT TESTED** = verification not performed. A local PASS is scoped to its evidence.

## Prioritized audit and changes

1. Security: the runtime audit identified Next.js advisories against 16.3.4,
   including GHSA-vcvr-r3jv-pc5j (next/og RCE) and later cache/image/development
   advisories. No exploit against this application was demonstrated. Updated
   Next.js and eslint-config-next to 16.3.8. Patched source-map-js to 1.2.2 for
   [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
   The override uses [pnpm's workspace settings](https://pnpm.io/settings).
   Moved the shadcn CLI to development dependencies; it is not imported by the app.
2. Abuse prevention: messaging/search/mutations and attachment verification/signing
   lacked per-account API request budgets. Added shared PostgreSQL minute counters
   before their work. Actor IDs remain derived from verified sessions. Tests prove
   atomic denial under concurrency and separation across accounts. Existing
   auth/realtime/calling/settings rate limits are retained.
   Storage bucket-cap validation now rejects negative, fractional and non-finite
   limits before signing or reading; adapter regression tests prove no operation
   reaches storage for those invalid settings.
3. Browser security: added nosniff, frame denial, no-referrer, first-party media
   permissions, a limited framing/object/base CSP, and removed X-Powered-By.
   The CSP deliberately does not claim full script injection protection; Next's
   inline bootstrap and the theme script need a tested nonce policy for that.
4. Reliability: expired sessions/rate counters and old leases had only manual SQL
   cleanup. Added authenticated maintenance with bounded batches and an additive
   expiry index (007). All cleanup endpoints now also accept authenticated GET
   for manually configured Vercel cron. Individual POST secrets remain supported.
   Unauthorized calls perform no work; transient failures return safe errors.
5. Deployment: `pnpm build` now selects the verified Webpack path and Node 24 is
   declared. Added a configuration-only preflight, complete environment example,
   production runbook and a PostgreSQL/Chrome GitHub verification workflow.
6. Test reliability: use Node's no-isolation mode so test bodies run in this
   sandbox; restore all test globals. Fixed DevTools DOM serialization and added
   route/content-type diagnostics. Added migration upgrade, bounded cleanup,
   preflight and two-user rendered browser journey coverage. No architecture was
   replaced. The original conversation-list.tsx edit is preserved separately.

## Evidence checklist

| Status | Area | Evidence / next action |
| --- | --- | --- |
| PASS | Fresh migration chain | Dedicated temporary PostgreSQL 16.15 cluster; tests migrate randomly named schemas, enforce foreign keys, ordering, uniqueness and rollback |
| PASS | Incremental migrations | Upgrade from migrations 001–005 to 006–007 preserves an account; unchanged reruns skip; existing tests exercise concurrent migration locking and checksum refusal |
| BLOCKED | Production migrations | No application target was approved or changed. Back up, review applied checksums, and follow deployment.md before explicitly running migrations |
| PASS | Authentication and authorization in PostgreSQL | Registration/login, hashed sessions, revocation, password-change race, membership/message ownership, IDOR denial and privacy tests |
| PASS | Full local integration run | `TEST_DATABASE_URL=... TEST_AUTH_HTTP=1 CHROME_BIN=/usr/bin/google-chrome pnpm test`: 125 passed, 0 failed, 0 skipped; temporary PostgreSQL 16.15, real Next.js HTTP and isolated Chrome profiles |
| PASS | Two-user rendered browser journey | Actual signup/login, Contacts search/create, message receive/edit/reply/read/delete, refresh and logout/session denial; landing/login/signup and conversation widths 320/390/768/1280 |
| PASS | Browser settings and messaging recovery | Profile feedback, theme persistence/system changes, settings navigation/labels; incoming delivery, typing, unread counts, reconnect, duplicate prevention, failed draft retention and pagination |
| PASS | Native local WebRTC | Two isolated Chrome profiles used real RTCPeerConnection with synthetic camera/mic and actual application signaling; received increasing inbound video bytes and remote audio/video tracks, then closed peers. This does not verify physical/network/TURN behavior |
| PASS | Attachment database/provider adapter | Isolated PostgreSQL quota/concurrency/lifecycle tests plus explicitly mocked Supabase bucket/signing/read/delete/retry tests |
| BLOCKED | Live Supabase | No safe test bucket authorized. Configure private bucket/server key, then perform the two-account upload/download/cancel/delete smoke test in deployment.md |
| PASS | Call state/signaling in PostgreSQL and unit mocks | Busy races, tab ownership, session expiry, bounded signals, accept/reject/timeout, media cleanup and failure logic |
| BLOCKED | Physical devices, cross-network WebRTC and TURN | Local media is insufficient. Configure a TURN relay, test Wi-Fi↔cellular in relay-only mode and record selected relay candidate/media bytes |
| PASS | Bounded maintenance and rate limits | Isolated upgrade/maintenance tests preserve live records/recent sequence fences, enforce 500-row batches, retry concurrently and atomically limit requests |
| BLOCKED | Deployed scheduler | No job provisioned. Configure three authenticated jobs, observe successful delivery plus drained cleanup backlogs, and test retries on disposable test records |
| PASS | Runtime dependency audit | `pnpm audit --prod --json`: zero advisories after patching; repeat before release |
| FAIL | Development dependency advisory | Full audit still reports high-severity braces 3.0.3 GHSA-vfj7-8cjw-p6xm through shadcn/ESLint fast-glob. Registry has no published patched version. Do not feed untrusted deep glob patterns to these tools; reassess updates before release. Finding is not suppressed |
| PASS | Reproducible install | `pnpm install --frozen-lockfile` succeeded with original lifecycle-script restrictions preserved |
| PASS | Static checks | `pnpm exec tsc --noEmit`, `pnpm lint`, `git diff --check` passed |
| PASS | Production build | `pnpm build` (Next.js 16.3.8, Webpack) completed compilation, TypeScript, 24-page generation and build traces outside the restrictive subprocess sandbox; no migration or deployment runs during builds |
| BLOCKED | Live production environment | No production endpoint or provider capacity validated. Configure deployment-specific secrets and run `pnpm config:check`; shape validation alone is insufficient |
| NOT TESTED | GitHub workflow | Authored and reviewed; not pushed or run remotely |
| NOT TESTED | Load, long-duration calls, full accessibility and physical mobile devices | Run representative load, a complete keyboard/assistive-technology/contrast audit and real-device checks. No WCAG or capacity claim |
| BLOCKED | Account deletion, recovery/MFA/email verification | Deliberately unavailable. Deletion needs the coordinated shared-record/storage lifecycle in settings.md; never implement a partial cascade |

## Security boundaries and residual risk

The final storage-cap guard was followed by its complete 10-test adapter/workflow
regression suite: 10 passed, 0 failed/skipped. No live Supabase calls were made.
The production preflight was run on the available private environment and failed
as intended for missing auth, Supabase, TURN and scheduler secrets; values were
not printed and no connection was made. Configure these before release.

Authentication uses Argon2id with dummy verification for unknown emails, rotating
random session tokens stored only as hashes, seven-day expiry and production
`__Host-` Secure/HttpOnly/SameSite=Lax cookies. Login rechecks the password hash
under the account lock. Sensitive password/session operations reauthenticate.
Mutations check origin/host, validate bounded bodies and use parameterized SQL;
the server derives actors and checks memberships. React escapes message/profile
text. No rich HTML renderer or arbitrary remote avatar URL is introduced. Avatars
decode and re-encode bounded raster input, dropping metadata and animation.

Runtime database credentials remain privileged over application tables; access
control is server-side SQL, not RLS. Compromise of the server/service key remains
significant. Use restricted runtime roles, protected secrets and operational
monitoring. Database inspection does not prove every race or production topology.

Downloads use authorized 60-second bearer URLs; recipients can retain files and
previously issued URLs cannot be immediately revoked. Signed upload token lifetime,
provider in-flight writes and cleanup grace periods remain documented limitations.
No antivirus, end-to-end encryption, push while closed, guaranteed background calls,
durable presence history, or full account erasure support is claimed.

Transient session/lease cleanup can remove an offline user's last-seen display;
the value represents retained recent activity, not an enduring account history.
Polling, changed history windows and unread queries remain portfolio-scale. See
deployment.md for budgets, pool multiplication and likely capacity bottlenecks.
