# Neon-only production readiness — 2026-10-20

The repository is prepared for a fresh Neon database and the existing private
production bucket. No live database/storage access, provisioning, deployment or
push was performed. Actual .env files and the protected conversation-list edit
were not changed by this work. No old data is required; backup setup is intentionally
excluded by the owner. See deployment.md and environment.md for setup.

## Verified locally

- pnpm test: 174 passed, zero failures; one HTTP/browser parent skipped in that
  command because it ran separately with TEST_AUTH_HTTP=1 and Chrome enabled.
- Separate real HTTP/Chrome audit: 16 passed, zero failures/skips. Covers auth,
  contacts, messaging, replies/edits/deletes/reads, settings/mobile navigation and
  two browsers exchanging synthetic WebRTC audio/video on loopback.
- Fresh PostgreSQL 17 initialization with no historical client roles passed.
  Loading the generic security fixture retained atomic hardening, ACL/RLS and
  rollback coverage. The owning role passed without SUPERUSER or BYPASSRLS;
  an untrusted BYPASSRLS client still could not access private tables/functions.
- The exact pnpm db:migrate CLI applied 001–008 in an empty isolated public
  schema; rerun reported up to date. Both runtime/direct readiness checks passed.
  Every original migration file remains byte-for-byte unchanged.
- Neon storage mocked transport tests, actual SDK offline signatures, exact
  byte/MIME policy, staging/sealing/replay protection, quotas, authorization,
  cleanup, retries, region matching and CORS readiness regressions passed.
- pnpm exec tsc --noEmit, pnpm lint, pnpm build (Webpack), pnpm audit --prod and
  git diff --check passed. Audit reported no known production vulnerabilities.
- Production Chrome PWA/responsive smoke: 35 public route/viewport checks passed,
  including hydration/errors, signup validation, themes, simulated installation,
  private-cache isolation and offline navigation. Runtime data/calling credentials
  were explicitly disabled. This is not real-device/native-install proof.
- Retained Verify ChatBit workflow YAML parsed successfully; PostgreSQL/security,
  HTTP/Chrome, type/lint/audit/build and production PWA checks are retained, with
  no production secrets referenced. The changed workflow has not run remotely.
- Tracked private-key/provider-token pattern scan found zero candidates; only
  .env.example is tracked. This pattern scan is not an audit of Git history.

Two foreground message-delivery samples were 1386 ms and 830 ms on isolated
loopback with a warm development journey and 200 ms UI observation. The reported
production 5–20 second delay remains unmeasured; no production improvement is
claimed. See messaging-reliability.md for numeric request timings and limits.

## Required manual acceptance

Set the values in environment.md, initialize the reviewed fresh Neon target with
pnpm db:migrate yourself, then run readiness/configuration checks and redeploy.
Use the production branch's exact endpoint, ap-southeast-1 S3 region and scoped
storage:write credential. The Console platform region aws-ap-southeast-1 is not
the signing region. Keep chatbit-attachments private and configure exact-origin
POST/GET/HEAD CORS if it is not already correct. check-storage.mjs is an explicit
read-only metadata/CORS check; it does not upload or provision anything.

Live Neon TLS/connections, real private image/video/document upload/download,
expiry/size-policy enforcement, bucket privacy metadata and deletion are not
verified by mocks. Production authentication, real-device installation, camera/
microphone behavior and TURN across networks also require manual tests. Local
PostgreSQL used loopback without TLS; strict TLS was configuration-tested only.
Configure authenticated cleanup and matching TURN infrastructure; neither is
provisioned by this repository. Vercel Hobby cron cannot supply the documented
minute/five-minute cleanup cadence. No paid service is purchased or required by
code; capacity and available scheduling/relay infrastructure remain operator choices.

## Cleanup inventory

Removed direct dependency @supabase/supabase-js and its unused transitive packages:
@supabase/auth-js, @supabase/functions-js, @supabase/phoenix,
@supabase/postgrest-js, @supabase/realtime-js, @supabase/storage-js and iceberg-js.
No replacement dependency was added during this Neon-only completion.

Retained .github/workflows/verify.yml; removed the manual backup workflow.
Android packaging was already absent and remains absent. Active browser PWA
assets, controls and worker remain. The unused legacy conversation query module
was removed after moving its security assertions onto active services. The mock
conversation-data module remains because the protected user edit imports it;
active routes use persistent data.

The only provider-name remnant in migration 008 is an immutable historical comment
and optional legacy role revocations, not a service dependency. The old CA filename
ignore rule remains to keep private local files out of Git. Old credentials may
still exist in the owner's ignored .env files; no code reads those provider keys.
No old hosted project was accessed or changed. Git history was not rewritten.

Deleted tracked files (the security fixture was replaced by tests/fixtures/security.sql):

- `.github/workflows/backup-database.yml`
- `docs/attachment-storage-investigation.md`
- `docs/chatbit-2.md`
- `docs/chatbit-3.md`
- `docs/database-security-verification.md`
- `docs/implementation-plan.md`
- `docs/manual-database-backup.md`
- `docs/neon-migration.md`
- `docs/repository-cleanup.md`
- `lib/server/attachment-storage-client.mjs`
- `lib/server/attachment-storage-core.mjs`
- `lib/server/conversation-queries.mjs`
- `scripts/backup-crypto.mjs`
- `scripts/backup-database.mjs`
- `scripts/compare-databases.mjs`
- `scripts/migrate-attachment-objects.mjs`
- `tests/attachment-migration.test.mjs`
- `tests/attachment-storage-client.test.mjs`
- `tests/backup-workflow.test.mjs`
- `tests/fixtures/supabase-security.sql`
