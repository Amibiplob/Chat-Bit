# Supabase to Neon cutover

Prepared code is not a completed migration. Do not use production for automated
checks. No Neon account, branch, bucket or credential is provisioned by this repo.
Keep the existing deployment on Supabase until the following rehearsal succeeds.

## Database

The existing pg driver works with Neon PostgreSQL. Use the Console's **pooled**
URL for DATABASE_URL and **direct** URL for DATABASE_MIGRATION_URL, targeting the
same branch, database and owning role. TLS always verifies the certificate and
hostname. sslmode=require and sslmode=verify-full are normalized to verified Node
TLS; remove other URL SSL parameters, including channel_binding (this pg setup
does not enforce required channel binding). DATABASE_SSL=verify is the default.
Neon uses public CA trust; do not carry a Supabase-only DATABASE_SSL_CA to Neon.
No alternate database or storage provider is tried on failure. Local development
can disable TLS only for loopback. Pool size defaults to three per Vercel instance.

All migrations 001–008 are retained, with checksums and transaction locking.
Neon migration runs require a direct DATABASE_MIGRATION_URL. Runtime must use the
same owning role (or a member of it): RLS has no client policies and deliberately
allows the owning server role. Do not give these credentials to browser clients.
`node scripts/check-database.mjs` explicitly inspects both configured endpoints
inside read-only transactions, checking history, table ownership/RLS and PUBLIC
grants. It does not prove existing data was transferred.

## Existing database rows: operator procedure

1. Rehearse on an empty isolated Neon branch/database first. Use PostgreSQL client
   tools at least as new as the source server; pin PostgreSQL 17 for a 17 source.
   Keep source and target credentials in separate ignored pg service/password
   files, with mode 0600 and sslmode=verify-full. Do not put passwords in command
   lines, shell history, logs or committed files.
2. Pause all source writes, scheduled cleanup and deployments for the final copy.
   Take and verify the existing encrypted backup. Keep its passphrase separately.
   Keep the source paused until validation and the initial cutover decision.
3. Export ChatBit's public schema only, including all rows, bytea avatars,
   constraints, indexes, triggers, functions and chatbit_schema_migrations:
   `pg_dump --dbname=service=chatbit_source --format=custom --schema=public --no-owner --no-acl --file=backups/chatbit.dump`.
   This assumes ChatBit exclusively owns public; inspect the archive TOC first
   and stop if unrelated application objects share it. Never copy Supabase auth,
   storage, realtime or global roles into Neon. App authentication lives in users
   and sessions, not Supabase Auth. The dump is private plaintext; encrypt it with
   the existing backup tools and remove plaintext after successful verification.
4. Inspect the archive TOC with `pg_restore --list backups/chatbit.dump`. Confirm
   that it includes CREATE SCHEMA public. On the **empty target only**, run
   `psql 'service=chatbit_target' -X --set=ON_ERROR_STOP=1 --command='DROP SCHEMA public'`.
   Do not add CASCADE: this must refuse if any existing objects depend on public.
   If public is absent already, skip that command. Stop and investigate any
   unexpected objects/restore errors; do not ignore them or clean a populated DB.
   Restore into this empty target using
   `pg_restore --dbname=service=chatbit_target --no-owner --no-acl --single-transaction --exit-on-error backups/chatbit.dump`.
   Do not run db:migrate to create tables before restoring a full schema archive.
   Do not use --clean against a populated target. The restore recreates public
   from the archive. Use a dedicated target database, never a shared application DB.
5. Because --no-acl intentionally omits Supabase role grants and revokes, reapply
   the existing, unchanged security file before allowing any app access:
   `psql 'service=chatbit_target' -X --single-transaction --set=ON_ERROR_STOP=1 --file=db/migrations/008_security_hardening.sql`.
   Set the target owning role/search_path=public. This file supports absent
   Supabase roles. Retain all restored migration-history rows and checksums.
6. Set target variables in a private operator environment, run
   `node scripts/check-database.mjs`, then `pnpm db:migrate` only with explicit
   authorization for that target (normally it reports up to date). The runner
   must not run automatically during Vercel builds or app startup.
7. Set MIGRATION_SOURCE_DATABASE_URL and MIGRATION_TARGET_DATABASE_URL to the
   frozen direct endpoints and run `node scripts/compare-databases.mjs`. It reads
   both databases inside read-only snapshots, computes primary-key ordered SHA-256
   fingerprints and counts for all 15 ChatBit tables, and emits pass/fail only.
   It uses source DATABASE_SSL_CA when supplied and public CA trust for Neon.
   It fails if any required table or primary key is missing. The comparison covers
   password hashes, sessions, message timestamps, read states, attachment states,
   bytea avatars and migration checksums. Keep results private, report only
   pass/fail and counts. Rehearse restore and authentication/authorization on an
   isolated target. A successful SELECT 1 or empty schema does not establish data
   preservation. Storage migration is separate; see below.

Rollback: before new target writes, restore old environment variables and redeploy
while source is still frozen. After target accepts writes, freeze both systems and
reconcile/export new data before rollback; switching URLs alone would lose writes.
Retain source rows and objects; do not delete the original project.

Sources checked 2026-10-19: [Neon pooling](https://neon.com/docs/connect/connection-pooling),
[Postgres migration](https://neon.com/docs/import/migrate-from-postgres).

## Private object storage

Implementation follows the documented [S3 compatibility](https://neon.com/docs/storage/s3-compatibility)
and [authentication](https://neon.com/docs/storage/authentication) contract, checked
2026-10-19. SigV4, path-style addressing, scoped Neon credentials and the official
AWS SDK are used. No AWS account, Neon management API key or public bucket is
needed at runtime. Credentials stay on the server. Neon `token_id` maps to
AWS_ACCESS_KEY_ID; `s3_secret_access_key` maps to AWS_SECRET_ACCESS_KEY. Use a
credential on the intended production branch with storage:write (includes read).
The branch endpoint and region come from Neon; do not guess them.

Set ATTACHMENT_STORAGE_PROVIDER=neon explicitly; default/absent remains supabase.
No failed operation falls back to Supabase. Database and storage selection are
independent so existing rows can be copied before changing the runtime target.
Use the already-created private chatbit-attachments bucket; app code never changes
bucket access or provisions infrastructure. The adapter checks owner-only ACLs
and rejects allow policies/unknown privacy metadata before access. Verify this
metadata against the real Neon branch before enabling production; failures remain
closed. A public bucket is never accepted merely because uploads would work.

Uploads use a 60-second presigned POST policy bound to exact size, MIME and a
random reservation staging key. Browser sends the signed form fields and file,
with progress, abort and retry preserved. Configure bucket CORS manually to allow
only your local/deployed origins and POST/GET/HEAD with Content-Type (AWS CLI
PutBucketCors is supported). Browser CORS does not grant private reads. Test exact
size policy enforcement, expiry, oversize rejection and wrong MIME on an isolated
branch: generic S3 compatibility and mock success cannot prove provider behavior.

After validating bytes on the server, completion writes a content-addressed sealed
object and atomically records its key with the message. Replaying the browser
upload cannot modify that final object. Concurrent completions remain idempotent.
Pending uploads reserve the existing 10 MiB capacity against the 100 MiB per-user
quota. Staging/sealed retry duplicates temporarily add physical storage overhead;
maintenance prunes staging and unused siblings after three hours, preserving the
available object. Existing deletion cleanup retains its three-hour retry fence to
handle late signed uploads. Lifecycle rules are not used: Neon documents them as
stored but not enforced. Schedule authenticated maintenance; do not rely on bucket
lifecycle expiration. Downloads still authorize membership first and expire after
60 seconds; previews stay behind the authenticated app endpoint. Avatars remain
in PostgreSQL bytea, so the database restore preserves them.

## Existing objects: separate operator copy

Keep source writes/cleanup and target writes/cleanup paused during the final copy.
Drain pending uploads first; failed/deleted rows are retained as metadata, and only
available attachments need content copied. Preserve source Supabase credentials
alongside new Neon variables in an ignored private operator environment.

- Set MIGRATION_SOURCE_DATABASE_URL to the **source direct** database endpoint.
  DATABASE_SSL_CA must trust that source (if Supabase needs a private CA). This
  tool's database connection is read-only; it never changes source/target rows.
- `node scripts/migrate-attachment-objects.mjs --verify` reads the available source
  rows and both object stores, and fails if any target object is missing/different.
  It never writes. No mode is selected implicitly.
- After explicitly authorizing the chosen isolated/production copy target, run
  `node scripts/migrate-attachment-objects.mjs --copy --confirm-frozen-target`.
  This writes only missing target objects, preserving storage_key exactly, and
  verifies SHA-256 bytes by reading back every object. Equal objects are skipped
  on restart; conflicting or inaccessible objects fail without overwriting them.
  It never deletes/updates source objects. Target must remain frozen: the
  existence check and write are separate operations, not an atomic create-only
  claim. A partially interrupted run can safely be verified and resumed.
- Re-run --verify and compare all database rows independently. Copy logs emit only
  aggregate counts. No signed URLs, object names, content or credentials are logged.
  Do not copy Supabase storage catalog rows to Neon PostgreSQL. The application
  uses its own message_attachments rows, not the Supabase storage metadata schema.

Use a separate isolated bucket/branch for upload/delete acceptance tests. Production
chatbit-attachments is never an automated-test target. Keep original Supabase files
for rollback. Do not activate Neon against uncopied attachments.


## Exact final switch checklist

1. Push the verified commits yourself. Rehearse restore, object copy, private POST
   upload/GET download, replay/size limits and two-account access on an isolated
   Neon branch first. Confirm your selected free plan needs no card and has enough
   database/storage/compute capacity; do not buy or upgrade automatically.
2. Freeze Supabase app writes and all cleanup jobs, drain uploads, and verify an
   encrypted source backup. Restore public schema **and rows** to empty Neon using
   the procedure above. Reapply 008 hardening after the no-ACL restore.
3. Run check-database.mjs against the Neon runtime/direct endpoints, then
   compare-databases.mjs against the frozen source and target. Require all table
   counts and fingerprints to match. Do not accept an empty migrated schema.
4. Copy existing available attachment objects with the explicit --copy command,
   then rerun --verify. Require every source object to match target bytes. Keep
   Supabase originals. Database restore does not move file bytes.
5. Verify chatbit-attachments is private on the intended production branch. Set
   exact-origin CORS and issue a storage:write scoped credential for that branch.
   Configure local/Vercel DATABASE_URL (pooled), DATABASE_MIGRATION_URL (direct),
   DATABASE_SSL=verify, ATTACHMENT_STORAGE_PROVIDER=neon, AWS_ENDPOINT_URL_S3,
   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and optional
   NEON_STORAGE_BUCKET=chatbit-attachments. Remove the Supabase-only TLS CA for
   Neon. Retain AUTH_RATE_LIMIT_SECRET, calling and cleanup configuration.
6. Run pnpm config:check in the private target environment. Redeploy with writes
   still controlled. Manually verify existing login, conversations, read states,
   avatars and old objects, plus private new image/video/document uploads,
   downloads, cross-account denial, cleanup, polling, PWA and cross-network calls.
   Live Neon acceptance and existing-data preservation are required before
   declaring migration complete. Then resume writes and authenticated cleanup.
7. Set GitHub backup provider/Neon secrets separately, run and verify the manual
   encrypted backup/restore workflow. Preserve source backups and rollback plan;
   after new Neon writes, rollback requires reconciliation rather than a URL swap.

## Verification evidence — 2026-10-20

- Full suite with disposable PostgreSQL 17.11, security fixtures, real Next.js HTTP
  routes and Chrome: 198 passed, zero failures, zero skips. This includes two-user
  authentication/messaging/settings and synthetic-device WebRTC on loopback.
- Follow-up migration/storage regressions: 14 passed, including actual AWS SDK
  offline SigV4 POST/GET generation. Git ignore follow-up passed separately.
- A second clean PostgreSQL 17 cluster without Supabase roles passed all five
  readiness/completion/comparison checks. CI now exercises that mode before its
  Supabase compatibility fixture; the revised CI has not been run remotely.
- Actual pg_dump/pg_restore of synthetic public data, no-owner/no-ACL restore,
  reapplication of unchanged 008 hardening, and read-only comparison passed for
  all 15 tables. Fixtures included users, a session, conversations, messages,
  attachment metadata and bytea avatar content. Runtime/direct readiness passed
  on the restored target. Initial public-schema conflict was reproduced and the
  runbook corrected before the successful rehearsal.
- pnpm exec tsc --noEmit, pnpm lint, pnpm build (Webpack), pnpm audit --prod and
  git diff --check passed. Audit reported no known production vulnerabilities.
- Production Chrome smoke passed 35 public route/viewport checks, hydration/error
  checks, signup validation, themes, simulated installation, cache isolation and
  offline navigation. Runtime database/storage credentials were explicitly blank.
  This does not prove native installation on a real device.
- No original migration file changed. No production database/storage target,
  infrastructure, deployment or push was touched. The unrelated conversation-list
  change remains outside all project commits. Tracked token/private-key pattern
  candidates were synthetic storage-client test fixtures; no confirmed secret was
  found, and only .env.example is tracked.

Local PostgreSQL checks used loopback without TLS; strict production TLS was
configuration-tested, not validated against live Neon. Storage transport, privacy,
POST size/MIME enforcement, object migration and cleanup were mocked; signatures
were generated by the actual SDK offline. No live Neon credentials were requested
or used. Real Neon private uploads/downloads, bucket metadata/policy behavior, CORS,
expiry/size enforcement, data preservation, TURN across networks and the updated
live encrypted backup/restore workflow still require explicit operator acceptance.
A private production bucket's existence alone is not that acceptance.
