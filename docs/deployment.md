# Production deployment and operations

ChatBit is a portfolio application with local integration evidence, not a claim
of deployed service readiness. Complete the blocked items in
[the readiness checklist](production-readiness.md) before inviting real users.
No application migrations, cloud resources, deployment, DNS changes or schedulers
are provisioned by this repository work.

## Architecture and supported build

Next.js 16.3.8 runs UI, Server Actions and Node.js HTTP routes on Vercel. Use Node
24 and pnpm 12.3.4 (pinned in package.json).
[Vercel supports Node 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
PostgreSQL 16+ stores accounts,
Argon2id password hashes, hashed seven-day sessions, direct conversations, messages,
receipts, activity leases, call signaling, preferences and small normalized avatars.
Direct parameterized SQL enforces membership/ownership. Supabase provides only
private attachment objects. Browser WebRTC carries media; no media is recorded.

`pnpm build` explicitly uses supported Webpack. Turbopack remains opt-in through
`pnpm build:turbo`; earlier sandbox runs stalled and it is not the release gate.
Type checking, linting and tests are never disabled to obtain a build.
Fonts are licensed local assets. Preserve the OFL notices in public/fonts.

Local development:

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env.local
# Configure your local PostgreSQL database, review migrations, then run deliberately:
pnpm db:migrate
pnpm dev
```

Never copy real credentials into documentation, tests or browser-prefixed variables.

## Production environment checklist

| Variables | Configuration |
| --- | --- |
| DATABASE_URL | Provider-supported pooled runtime PostgreSQL endpoint; restricted DML role |
| DATABASE_MIGRATION_URL | Reviewed direct connection with DDL permissions; only needed for migration runs |
| DATABASE_SSL, DATABASE_SSL_CA | `verify`; optional provider CA PEM. Remove SSL URL parameters |
| DATABASE_POOL_MAX | Default 3 per serverless instance; integer 1–20. Budget across instances |
| AUTH_RATE_LIMIT_SECRET | Random server-only secret, at least 32 characters; shared across instances |
| SUPABASE_URL, SUPABASE_SECRET_KEY | HTTPS project endpoint and server secret/service-role credential |
| SUPABASE_STORAGE_BUCKET | Private bucket, default chatbit-attachments |
| CALL_STUN_URLS | JSON string array; default Google STUN. `[]` disables STUN |
| CALL_TURN_URLS, CALL_TURN_SHARED_SECRET | JSON TURN/TURNS URLs and coturn-compatible shared secret, 32+ characters |
| CALL_RELAY_ONLY | `1` requires relay; `0` permits direct peer connectivity |
| MAINTENANCE_CLEANUP_SECRET | Independent 32+ character secret for session/lease/rate-limit POST cleanup |
| ATTACHMENT_CLEANUP_SECRET, CALL_CLEANUP_SECRET | Independent 32+ character secrets for their POST cleanup jobs |
| CRON_SECRET | Optional 32+ character bearer credential for all three GET cleanup routes (Vercel cron) |

Generate secrets independently with `openssl rand -hex 32`, store them privately,
and configure Preview and Production independently. Neither test database URLs
nor test flags belong in production configuration. Run `pnpm config:check` with
the intended private environment before deployment. It validates shapes only:
it does not connect, migrate, inspect bucket privacy, prove TURN connectivity or
verify scheduler delivery. A configured TURN server is required by this release
preflight, because STUN alone cannot reliably serve different networks.

## Safe production migration procedure

1. Take and test-restorable backups of PostgreSQL and retained storage objects.
   Review the actual target host/database privately. Do not use a production URL
   for any test suite. Schedule a maintenance window if old code is serving traffic.
2. Review the unchanged migration chain: `001_initial.sql`,
   `002_auth_rate_limits.sql`, `003_realtime.sql`, `004_file_sharing.sql`,
   `005_calling.sql`, `006_settings.sql`, then new `007_maintenance.sql`.
   Migration 005 terminates any legacy open calls; allow active users to finish
   before first applying it. Migration 007 adds a normal index and can block
   writes while building on a large activity table; plan the window accordingly.
3. Inspect `chatbit_schema_migrations` on an existing target. The runner serializes
   execution with an advisory transaction lock, validates applied file checksums,
   and applies pending files in one transaction. Never edit an applied SQL file,
   manually mark migrations applied, or drop conflicting tables to force success.
   A failed chain rolls back DDL and tracking together.
4. Only after target review and explicit approval, set DATABASE_MIGRATION_URL to
   the direct DDL connection and execute `pnpm db:migrate` once. The runner loads
   .env.local/.env as fallbacks: explicitly provide the intended URL to prevent
   accidentally selecting a local environment's target. Do not run migrations in
   build/install hooks. Rerunning unchanged migrations reports up to date.
5. Grant the runtime role USAGE on the schema and SELECT/INSERT/UPDATE/DELETE on
   the application tables, including migration 006/007 objects. Runtime access
   must not permit DDL or public database access. Use separate credentials for DDL.
6. Deploy compatible code, smoke-test with two test accounts, then monitor error
   rates and cleanup backlog. Code rollback does not roll schema back; restore
   data only through an approved recovery procedure. There is no reset script.

The new expiry index supports bounded stale lease cleanup. Existing session,
rate-limit, call-expiry, attachment-cleanup, message-order and membership indexes
remain in place. No shared records are deleted by migration 007.

## Private storage and smoke test

Follow [file-sharing setup](file-sharing.md). The bucket must have Public disabled
and a positive file limit at most 10485760 bytes. Restrict allowed MIME types to
the server allowlist; no public listing/writing policies are required. Keep secret
keys server-only. Use a separate safe bucket/project for provider testing.

On a reviewed deployment, use two disposable test accounts to upload a small PNG,
text file, PDF and a playable media file. Confirm progress/cancel, recipient
delivery, refresh persistence, previews and forced downloads. An unrelated third
account must receive 404, and signed downloads expire after 60 seconds. Test author
deletion and a scheduled retry during a simulated storage outage using only these
test records. Check bucket privacy and anonymous reads directly. Do not point a
test harness at real user files. Verify 10 MiB size and 100 MiB quota boundaries
in isolated database tests rather than filling the production bucket.

Provider adapters are simulated in automated tests; local database tests prove
reservation/concurrency/authorization behavior, not live Supabase transfers or
CORS. Full-file verification buffers at most 10 MiB per request. Media proxies
stream verified bytes but do not implement byte ranges; seeking is browser-dependent.
Content signatures are not malware scanning. Signed upload tokens outlive the
15-minute application reservation; three-hour tombstones cover the documented
provider token lifetime and a grace period. Extremely late provider writes need
manual reconciliation. Cleanup deletes only explicitly recorded object keys,
never sweeps an entire bucket. See the retention limitations in file-sharing.md.

## Calling and TURN

Use HTTPS, permit camera/microphone for the first-party origin, and configure a
TURN service supporting short-lived HMAC credentials. The one-hour credential is
issued only to an authorized active call owner; the long-lived shared secret is
never sent to the browser. Match the server clock/secret/ports to the relay.
`CALL_RELAY_ONLY=1` fails closed when TURN is absent. No automatic ICE restart is
implemented; a failed connection ends and users can start a new call.

Before release, test voice and video using two physical devices on different
networks (for example Wi-Fi and cellular). Exercise accept/reject, mute/camera,
disconnect, tab ownership and termination. In relay-only mode inspect WebRTC stats
and confirm the selected candidate pair is `relay` and media bytes increase.
Verify expiry, invalid credentials and relay outage failures. Local synthetic
Chrome devices prove native WebRTC signaling/media on one host only; mocks prove
control logic only. Neither substitutes for this network test. Review
[calling limitations](calling.md), including background lease expiry and the
55-minute call cap.

## Cleanup scheduler

| Endpoint | Bounded work per invocation |
| --- | --- |
| /api/maintenance/cleanup | Up to 500 old activity leases, 500 expired sessions, 500 expired rate-limit counters |
| /api/calls/cleanup | Up to 100 expired calls and 1,000 expired signals; terminal calls release slots/signals |
| /api/attachments/cleanup | Up to 20 recorded failed/abandoned/pending-deletion object paths; retry/backoff retained |

External schedulers POST with `Authorization: Bearer <endpoint-specific secret>`.
Vercel cron invokes GET with `Authorization: Bearer <CRON_SECRET>`; GET requires
CRON_SECRET specifically and does not accept account cookies. Unconfigured or
incorrect credentials return 401 before database/storage access. Failures return
503 without private details; successful bounded batches return 200. Responses
are no-store. Authenticated retries/concurrent invocations are safe; an attachment
removal failure is recorded for later retry even if the batch endpoint returns 200.
Monitor durable cleanup_error/cleanup_after and backlog, not just HTTP status.

Configure jobs deliberately after reviewing hosting eligibility. Suggested initial
frequencies: maintenance every five minutes, calls every minute, attachments every
five minutes. Increase frequency when bounded batches cannot keep up. No vercel.json
cron schedule is committed, so deployment cannot silently enable deletion jobs.
If a hosting plan cannot provide these frequencies, use a securely configured
external scheduler supporting authenticated requests. Daily jobs leave long
cleanup delays. As checked 2026-10-16, [Vercel Hobby cron is limited to once daily](https://vercel.com/docs/cron-jobs/usage-and-pricing),
so the suggested minute-frequency jobs require another eligible scheduler or plan.
Do not put bearer secrets in URLs. Manually run only a reviewed
endpoint on its intended environment. This work did not execute production cleanup.

Only expired/transient or explicitly deleted data is cleaned. Recent departed
lease sequence fences survive at least one minute; live sessions/leases/counters,
messages, users and call history are retained. Expired sessions cascade leases;
calling reconciliation handles their call ownership. Account deletion stays
unavailable pending [the coordinated erasure lifecycle](settings.md).

## Vercel release checklist

Set Node 24, frozen pnpm installation, `pnpm build`, and the environment values
above. Keep credentials separated by deployment environment. Confirm the provider
supports the runtime's pool/TLS settings and network access. Configure function
duration/memory sufficient for bounded cleanup and 10 MiB verification. Vercel
must terminate HTTPS and enforce its transport security policy; check deployed
headers. Application headers deny framing, disable MIME sniffing, suppress
referrers (including signed URL referrals) and allow camera/microphone only for
self. The limited CSP protects framing/base/object contexts; it is **not** a full
script-src policy. A strict nonce CSP needs a separately tested Next.js integration.

No production settings or DNS were changed here. After manual deployment, complete
the storage, TURN, scheduler, TLS, two-user and responsive smoke checks, record
evidence, and reassess the readiness checklist before public use.

## Tests, costs and troubleshooting

Run production builds and browser suites sequentially. A dedicated local database
can be started using your PostgreSQL installation or a disposable PostgreSQL 16
container on a loopback port. Supply only its test URL:

```bash
docker run --rm --name chatbit-isolated-tests -e POSTGRES_USER=test-user -e POSTGRES_PASSWORD=test-password -e POSTGRES_DB=chatbit_test -p 127.0.0.1:55438:5432 -d postgres:16
# Wait until this reports accepting connections:
docker exec chatbit-isolated-tests pg_isready -U test-user -d chatbit_test
TEST_DATABASE_URL=postgresql://test-user:test-password@127.0.0.1:55438/chatbit_test TEST_DATABASE_SSL=disable TEST_AUTH_HTTP=1 CHROME_BIN=/usr/bin/google-chrome pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm audit --prod
pnpm build
git diff --check
# After testing, remove only the disposable test service (no volume was attached):
docker stop chatbit-isolated-tests
```

Each suite creates/drops a random schema. Tests never select DATABASE_URL as a
fallback. `pnpm test` disables Node subprocess isolation because this sandbox
otherwise misleadingly reports file-level passes without exercising test bodies.
All current suites run sequentially and restore their test globals. The GitHub
workflow provides a PostgreSQL service and Chrome checks; it has not been run on
GitHub by this work. If Chrome is missing, install it in the test environment and
set CHROME_BIN. A stale test server uses .next/auth-http-test; stop only the PID
confirmed in that directory's lock file. Never stop an unrelated dev server.

Polling is portfolio-scale: visible messaging tabs use about 1,800 sync requests
per hour plus heartbeats, idle calling about 1,200 and active signaling about 3,600
per participant. Notifications can keep polling hidden tabs with permission. Each
serverless instance has its own pool; horizontal scale multiplies connections.
User-scoped per-minute limits apply across tabs: messaging 180 reads/90 writes,
attachments 60 reads/20 writes, in addition to existing auth/realtime/calling/settings
limits. A 429 is expected when a user exceeds these budgets; wait a minute or close
extra tabs. Revision checks avoid resending unchanged history, but changed snapshots
and unread counts grow with retained messages/conversations. No load/capacity SLA
is established. Inspect query plans and provider metrics before increasing scale.

Free-tier plans can sleep, cap database connections/function invocations, restrict
cron frequency, or exhaust storage/egress. Confirm actual plan allowances in each
provider dashboard before release; no free/no-card guarantee is made. Monitor
database timeouts, 401/429/503 rates, pool waits, cleanup backlog, memory and egress.
Never log session tokens, database URLs, signed storage URLs, SDP/ICE or secrets.
On migration failure investigate permissions, checksum drift and connectivity;
never delete tracking rows to bypass the error. On upload failure check private
bucket configuration and quotas. On call failure check HTTPS permissions, TURN
credentials and selected ICE candidates. Account recovery, MFA, email changes,
and safe account deletion remain unavailable.
