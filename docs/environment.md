# Configuration reference

Copy .env.example to an ignored .env.local for development. Next.js uses .env.local
before .env; CLI tools use the same precedence, so stale local overrides must be
updated when switching. Configure matching server-only values in the intended
Vercel environment (Production/Preview) and redeploy. Never prefix credentials
with NEXT_PUBLIC_. No credentials are needed to build public pages.

| Variables | When required |
| --- | --- |
| DATABASE_URL | Runtime PostgreSQL endpoint. Neon: pooled URL for the selected branch/database/owning role. |
| DATABASE_MIGRATION_URL | Direct Neon URL for migration/readiness tools. Other PostgreSQL defaults to DATABASE_URL if absent. |
| DATABASE_SSL | Optional, defaults verify. disable only for loopback development; never production. |
| DATABASE_SSL_CA | Optional PEM custom trust root for Supabase/private CA. Unset for Neon's public CA. |
| DATABASE_POOL_MAX | Optional, defaults 3 per instance, integer 1–20. |
| AUTH_RATE_LIMIT_SECRET | Required for production authentication, independent random 32+ characters; preserve across the migration. Sessions use random tokens stored hashed in PostgreSQL, no extra JWT secret is needed. |
| ATTACHMENT_STORAGE_PROVIDER | Optional, defaults supabase. Explicit neon activates the Neon adapter. Invalid values fail closed. |
| AWS_ENDPOINT_URL_S3 | Required for Neon: exact HTTPS branch storage endpoint from Neon. |
| AWS_REGION | Required for Neon: region returned with that endpoint. |
| AWS_ACCESS_KEY_ID | Required for Neon: scoped credential token_id. |
| AWS_SECRET_ACCESS_KEY | Required for Neon: scoped credential s3_secret_access_key (not api_token or a Neon management API key). |
| NEON_STORAGE_BUCKET | Optional, defaults chatbit-attachments; must remain private. |
| SUPABASE_URL, SUPABASE_SECRET_KEY | Required only for Supabase storage or source-object copying. Existing secret-key/JWT compatibility retained. |
| SUPABASE_STORAGE_BUCKET | Optional Supabase bucket name, defaults chatbit-attachments. |
| CALL_STUN_URLS | Optional JSON string array; existing default Google STUN server. STUN alone is insufficient for some networks. |
| CALL_TURN_URLS, CALL_TURN_SHARED_SECRET | TURN URLs JSON array and independent shared secret needed for reliable cross-network calls. Matching TURN infrastructure must already exist; app code does not provision it. |
| CALL_RELAY_ONLY | Optional 0/1, defaults 0. 1 requires configured TURN. |
| CRON_SECRET | Independent random 32+ characters. Authorizes GET on all three cleanup endpoints. This is the simplest scheduler setup. |
| MAINTENANCE_CLEANUP_SECRET, ATTACHMENT_CLEANUP_SECRET, CALL_CLEANUP_SECRET | Alternative independent 32+ character secrets for POST jobs on /api/maintenance/cleanup, /api/attachments/cleanup, /api/calls/cleanup respectively. Not required when using authenticated GET jobs with CRON_SECRET. |

Use a trusted existing scheduler for the cleanup endpoints with
`Authorization: Bearer <corresponding secret>`; secrets are headers, never URL
parameters. Jobs are not provisioned automatically. Existing cadence/bounded work
requirements in deployment.md still apply. Vercel Hobby cron frequency is limited;
do not assume it can supply every short cleanup cadence. No paid service or card
is required by the code, but free plan capacity, sleep behavior and availability
must be checked against your account before opening production. TURN availability
is a separate requirement and no free unlimited relay is promised.

## Migration only

- MIGRATION_SOURCE_DATABASE_URL: direct frozen Supabase source for object copy and
  database comparison. For Supabase custom CA, supply DATABASE_SSL_CA in that
  operator process; clear it before checking the public-CA Neon endpoint.
- MIGRATION_TARGET_DATABASE_URL: direct frozen Neon target for database comparison.
  Comparison uses public CA trust for Neon, independently of the Supabase CA.
- Source SUPABASE_* and target AWS_* storage credentials coexist only during copy.
  The copy tool selects each explicitly and never changes runtime provider values.
- pg_dump/pg_restore/psql use private pg service/password files, not application
  dotenv values; configure sslmode=verify-full and appropriate CA separately.

## Backup only

The preserved manual GitHub workflow uses repository variable
BACKUP_DATABASE_PROVIDER=neon to select Neon; absent/empty means legacy supabase.
For Neon set repository secrets BACKUP_DATABASE_HOST (direct hostname, no URL or
pooler), BACKUP_DATABASE_USER, BACKUP_DATABASE_PASSWORD, BACKUP_DATABASE_NAME and
CHATBIT_BACKUP_PASSPHRASE (32+ characters). It uses system CA trust and verified TLS.
No Neon runtime secrets are automatically shared with GitHub. For Supabase retain
SUPABASE_BACKUP_HOST, SUPABASE_BACKUP_USER, SUPABASE_BACKUP_PASSWORD,
SUPABASE_BACKUP_CA and CHATBIT_BACKUP_PASSPHRASE. Provider selection is explicit;
failed Neon backups never fall back to Supabase.

The backup workflow still exports read-only, encrypts archives, verifies checksums,
and restores public schema/ACL/RLS/counts into disposable PostgreSQL 17. Supabase
mode additionally exports managed schemas for reference/readability; Neon mode
skips those absent services. Role attributes and object bytes are not recovered by
a PostgreSQL backup. Keep separate object copies and test recovery. A prepared
workflow is not evidence of a successful live backup.

## Tests and local tooling only

TEST_DATABASE_URL / TEST_DATABASE_SSL select a dedicated disposable test DB.
TEST_SECURITY_DATABASE_URL / TEST_SECURITY_DATABASE_SSL additionally enable the
PostgreSQL 17 role/security fixture suite. TEST_AUTH_HTTP=1 enables the isolated
HTTP/browser journey; CHROME_BIN selects Chrome. Never set these to production.
CHATBIT_BROWSER_ORIGIN selects the local production server for check-browser.mjs.
Existing diagnostic flags are optional developer tools; no runtime configuration
requires enabling raw error or credential logging.

`pnpm config:check` validates production configuration shape without connecting.
It requires TURN and scheduler configuration for its full production readiness
check. `node scripts/check-database.mjs` is an explicit read-only network check;
never run it inadvertently as part of install/build. Object-copy/comparison modes
are detailed in neon-migration.md. Neither builds nor startup applies migrations.
