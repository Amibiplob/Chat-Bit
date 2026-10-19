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
4. Restore into an **empty** target using
   `pg_restore --dbname=service=chatbit_target --no-owner --no-acl --single-transaction --exit-on-error backups/chatbit.dump`.
   Do not run db:migrate to create tables before restoring a full schema archive.
   Do not use --clean against a populated target. If public already exists, review
   the TOC and use an isolated empty database rather than ignoring restore errors.
5. Because --no-acl intentionally omits Supabase role grants and revokes, reapply
   the existing, unchanged security file before allowing any app access:
   `psql 'service=chatbit_target' -X --single-transaction --set=ON_ERROR_STOP=1 --file=db/migrations/008_security_hardening.sql`.
   Set the target owning role/search_path=public. This file supports absent
   Supabase roles. Retain all restored migration-history rows and checksums.
6. Set target variables in a private operator environment, run
   `node scripts/check-database.mjs`, then `pnpm db:migrate` only with explicit
   authorization for that target (normally it reports up to date). The runner
   must not run automatically during Vercel builds or app startup.
7. Compare every ChatBit table's exact row count and a deterministic content
   digest ordered by primary key between the frozen source and target, including
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
