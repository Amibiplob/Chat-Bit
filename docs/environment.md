# Neon-only environment

Copy .env.example into ignored .env.local or .env. Next.js and CLI tools load
.env.local before .env, so remove stale overrides when changing configuration.
Set equivalent server-only values in Vercel's intended environment and redeploy.
No secrets use NEXT_PUBLIC_. This work does not modify actual environment files.

| Name | Requirement |
| --- | --- |
| DATABASE_URL | Neon pooled runtime PostgreSQL URL for the intended database and owning role. |
| DATABASE_MIGRATION_URL | Direct Neon URL for the same branch/database/role; migration/readiness only. |
| DATABASE_SSL | verify in production, also the default. Local isolated PostgreSQL tests may use disable on loopback only. |
| DATABASE_POOL_MAX | Optional integer 1–20; default 3 per Vercel instance. |
| AWS_ENDPOINT_URL_S3 | Exact HTTPS branch storage endpoint returned by Neon. |
| AWS_REGION | S3 region returned with that endpoint, e.g. ap-southeast-1. The Console platform region aws-ap-southeast-1 is not the S3 signing region. |
| AWS_ACCESS_KEY_ID | Scoped Neon credential token_id. |
| AWS_SECRET_ACCESS_KEY | Scoped credential s3_secret_access_key, not api_token or a management API key. |
| NEON_STORAGE_BUCKET | Optional, default chatbit-attachments. Keep it private on production. |
| AUTH_RATE_LIMIT_SECRET | Independent random 32+ character production secret, shared across instances. Sessions are random opaque tokens stored hashed in PostgreSQL; no extra JWT secret is needed. |
| CRON_SECRET | Independent random 32+ character secret for authenticated GET cleanup jobs on all three cleanup endpoints. |
| CALL_STUN_URLS | Optional JSON string array; defaults to the existing Google STUN server. |
| CALL_TURN_URLS | JSON string array of your existing TURN URLs, needed for reliable cross-network calls. |
| CALL_TURN_SHARED_SECRET | Independent 32+ character secret matching your TURN server's REST authentication configuration. |
| CALL_RELAY_ONLY | Optional 0/1; default 0. 1 requires TURN. |
| MAINTENANCE_CLEANUP_SECRET, ATTACHMENT_CLEANUP_SECRET, CALL_CLEANUP_SECRET | Optional alternatives to CRON_SECRET for independent POST cleanup jobs. Each must be an independent 32+ character secret. |
| CHATBIT_REALTIME_PROVIDER | Optional; empty disables hosted invalidations, `ably` enables the existing integration. Other values fail validation. |
| ABLY_API_KEY | Required only with provider `ably`; full server-only `app.key:secret` credential. It does not replace ChatBit sessions. |
| CHATBIT_PERFORMANCE | Optional `1` enables bounded server timing diagnostics; otherwise disabled. Browser timing uses the separate `chatbit.performance` localStorage flag. |

Generate independent secrets locally with a password manager or
`openssl rand -hex 32`; never send them to chat or commit them. Neon publicly
trusted certificates require no custom CA setting. Use credentials from the
production branch for the existing private bucket. Local development against Neon
also requires verified TLS. No provider switch or database fallback exists.

Cleanup paths are /api/maintenance/cleanup, /api/attachments/cleanup and
/api/calls/cleanup. GET uses CRON_SECRET; POST uses each endpoint's named secret.
Send `Authorization: Bearer <secret>` in headers, never query strings. No scheduler
is provisioned automatically. See deployment.md for cadence and free-plan limits.

`pnpm config:check` checks shapes without network access. It intentionally rejects
STUN-only configuration. No backup or old-data-copy variables are required.

The production checker requires the pooled runtime hostname, a matching direct
migration URL, explicit remote URL credentials and a region matching the storage
endpoint. URL identity query overrides are rejected to avoid redirecting an
otherwise validated endpoint. Use the documented sample URL shape without
channel_binding=require; Node pg negotiates channel binding when the server offers
it but cannot enforce libpq's required mode. Standard sslmode=require/verify-full
URLs retain strict certificate verification.

Required for full release readiness: the eight core names DATABASE_URL,
DATABASE_MIGRATION_URL, DATABASE_SSL, AWS_ENDPOINT_URL_S3, AWS_REGION,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and NEON_STORAGE_BUCKET, plus
AUTH_RATE_LIMIT_SECRET, CRON_SECRET, CALL_TURN_URLS and CALL_TURN_SHARED_SECRET.
DATABASE_SSL and NEON_STORAGE_BUCKET have secure defaults; you may omit them if
those defaults are intended. The three POST cleanup secrets replace CRON_SECRET
only when using that alternative scheduling mode. Tests and optional tuning do
not add mandatory Vercel variables.

## Isolated tests and measurement controls

These switches are read by repository tests/scripts, not production features.
Never point their database URLs at live data. Test suites create schemas, apply
migrations to fixtures and write/delete data. `.env.example` shows common switches;
CI supplies the expanded suite gates explicitly.

| Names | Accepted value / purpose |
| --- | --- |
| `TEST_DATABASE_URL`, `TEST_DATABASE_SSL` | Disposable PostgreSQL URL and `verify` (default) or loopback-only `disable`. |
| `TEST_SECURITY_DATABASE_URL`, `TEST_SECURITY_DATABASE_SSL` | Disposable loopback PostgreSQL 17 with `tests/fixtures/security.sql`; TLS choice as above. |
| `TEST_AUTH_HTTP`, `CHROME_BIN` | `1` enables real local Next.js HTTP journeys; browser checks also need an installed executable path. |
| `TEST_NEXT_TURBOPACK` | `1` selects Turbopack for isolated development servers; otherwise Webpack. |
| `TEST_NAVIGATION_BROWSER`, `TEST_WORKSPACE_BROWSER` | `1` enables navigation and persistent-panel browser coverage. |
| `TEST_SPA_BROWSER`, `TEST_SPA_SYNC_ACCEPTANCE` | `1` enables optimistic/retry browser journeys and synchronous pending-DOM assertions. |
| `TEST_CALLING_BROWSER` | `1` enables the native WebRTC controller simulation with synthetic media. |
| `TEST_PUSH_TRANSPORT`, `TEST_PUSH_BROWSER` | `1` enables loopback SDK protocol and browser invalidation fixtures; no hosted Ably service is used. |
| `CHATBIT_BROWSER_ORIGIN` | Production PWA smoke origin; loopback only, default `http://127.0.0.1:3187`. |
| `TEST_RUNTIME_ORIGIN` | Loopback origin for first-paint theme and authentication recovery checks. |
| `TEST_RUNTIME_PRODUCTION`, `TEST_RUNTIME_DATABASE_FAILURE` | `1` selects production cookies / an intentionally unavailable local database. The flags must match the test server. |
| `TEST_SPA_SAMPLES`, `TEST_SPA_SEND_DELAY_MS` | Integer 12–60 samples (default 12), delay 0–3,000 ms (default 0). |
| `TEST_NAVIGATION_LATENCY_MS` | Synthetic navigation latency in milliseconds; default 0. |
| `TEST_SPA_BASELINE`, `TEST_NAVIGATION_BASELINE`, `TEST_WORKSPACE_BASELINE` | `1` selects historical comparison behavior; omit for release regressions. |
| `TEST_CALLING_BASELINE_FILE` | Optional historical calling module path for comparisons; omit for release verification. |
| `DEBUG_CHATBIT_BROWSER`, `TEST_PUSH_DEBUG` | `1` enables synthetic-fixture diagnostics; optional, normally omitted. |

`NODE_ENV` and `VERCEL` are framework/hosting signals. `NEXT_TELEMETRY_DISABLED=1`
is an optional Next.js tooling setting used by isolated servers.
`CHATBIT_AUTH_HTTP_TEST=1` is an internal harness switch for a separate development
build directory and test TypeScript configuration; do not set it on a deployment.
