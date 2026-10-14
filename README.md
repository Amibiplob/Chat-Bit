# ChatBit

ChatBit is a portfolio communication application with an existing responsive
landing page, authentication screens, chat interface, calls page and settings.
The UI currently uses demonstration conversations, messages and calls.
The database foundation and secure authentication are implemented. Registration,
login, logout and protected application routes use PostgreSQL-backed sessions.
Realtime messaging, uploads and WebRTC remain future milestones.

## Stack and architecture

Next.js App Router 16.3.4, React 19.2.8, TypeScript, Tailwind CSS 4,
Base UI/shadcn, and PostgreSQL accessed with direct parameterized SQL using `pg`.
No ORM or Supabase integration is used by the new backend.

The intended deployment has Next.js UI/HTTP APIs on Vercel, a PostgreSQL database,
a separately hosted persistent WebSocket service, private object storage and
WebRTC media between browsers. Database infrastructure and authentication are implemented.
Ordinary Vercel functions cannot host the persistent WebSocket service.

Server-only modules live in `lib/server`. The database pool initializes lazily,
uses a small connection limit and verifies TLS certificates. Transactions acquire
one pg client and release it after commit/rollback. Internal message and file
queries join conversation membership before returning private data. These
server-only wrappers derive the user ID from a validated session on every data
access; callers cannot supply an arbitrary user ID. They are not public endpoints. SQL is parameterized and credentials are never logged.

Implementation references: [pg transactions](https://node-postgres.com/features/transactions),
[pg TLS configuration](https://node-postgres.com/features/ssl), and
[PostgreSQL constraints](https://www.postgresql.org/docs/16/ddl-constraints.html).

See [the repository audit and remaining milestones](docs/implementation-plan.md).

## Local development

Use Node.js 24 LTS and the pinned pnpm version in package.json.
Next.js requires Node.js 20.9 or newer. If using nvm, run `nvm use 24`.

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env.local
pnpm dev
```

Open http://localhost:3000. Public pages work without a database; authentication
and protected application pages require a configured, migrated PostgreSQL database.
The chat and call UI still uses sample data, and profile/settings persistence
remains unfinished. See [authentication setup and security](docs/authentication.md).

## PostgreSQL setup and migrations

Use PostgreSQL 16 or newer. Create a dedicated database and database role locally,
or configure a managed PostgreSQL provider. This milestone does not provision
an account or verify any provider's free-tier/no-card eligibility.

```sql
CREATE ROLE chatbit LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE chatbit OWNER chatbit;
```

Set `.env.local` with your own connection details. Run migrations deliberately
against the intended database, separately from builds:

```bash
pnpm db:migrate
```

The migration runner loads `.env.local` then `.env` without overwriting existing
process variables. `DATABASE_MIGRATION_URL`, when nonempty, selects a direct
endpoint for migrations; otherwise `DATABASE_URL` is used. Use the public schema
in a dedicated database. Migration SQL is additive and creates users, sessions,
canonical direct conversations, members, messages, attachments, per-message
read states and calls. UUIDs, timestamps, indexes, foreign keys and checks enforce
membership and relationships. Deleting messages is intended to use `deleted_at`.
Attachment-only messages will need a validated caption or a later schema change.

Migrations run in one transaction under an advisory lock. Completed filenames
and SHA-256 checksums are recorded in `chatbit_schema_migrations`. Reruns skip
unchanged files; changed/missing applied files are rejected. Do not edit applied
migrations. Add the next numbered SQL file instead. There is no automatic reset,
drop or rollback command. Existing conflicting tables cause migration failure;
inspect and plan a safe reconciliation rather than removing data.

In production, use a direct connection for migrations and a provider-supported
pooled endpoint for application queries. Give the application role only needed
SELECT/INSERT/UPDATE/DELETE permissions; use a separate migration role for DDL.
The current authorization boundary is server-side membership-scoped SQL, not
PostgreSQL row-level security. Never expose database credentials to browsers.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL application connection string |
| `DATABASE_MIGRATION_URL` | Optional direct migration connection string |
| `DATABASE_SSL` | `verify` (default); `disable` only for local loopback development |
| `DATABASE_SSL_CA` | Optional PEM CA certificate for verified TLS |
| `DATABASE_POOL_MAX` | Integer 1–20, default 3; budget across all serverless instances |
| `AUTH_RATE_LIMIT_SECRET` | Required in production, at least 32 random characters, shared across instances |
| `TEST_AUTH_HTTP` | Set to `1` with the test database to run real Next.js form/route tests |
| `TEST_DATABASE_URL` | Separate PostgreSQL database used only by integration tests |
| `TEST_DATABASE_SSL` | Test TLS policy, default `verify` |

Remove SSL and `uselibpqcompat` URL parameters and configure
TLS through these variables. This avoids pg URL options overriding certificate
verification. TLS cannot be disabled for remote hosts or production. No variables
above may use a `NEXT_PUBLIC_` prefix. Keep `.env` and `.env.local` out of Git.
`.env.example` contains placeholders only.

Generate `AUTH_RATE_LIMIT_SECRET` with `openssl rand -hex 32` and configure it in
Vercel. Development uses a local fallback when it is unset; production fails
closed. Realtime, file storage and TURN configuration remain future work.

## Testing

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
git diff --check
```

The native Node.js test runner needs no additional test framework. Unit tests
cover configuration and transaction lifecycle. PostgreSQL integration tests
are skipped unless `TEST_DATABASE_URL` is set. Point it at a dedicated test
instance, never a production database:

```bash
TEST_DATABASE_URL=postgresql://chatbit:local-password@127.0.0.1:5432/chatbit_test TEST_DATABASE_SSL=disable pnpm test
```

Integration tests create a randomly named schema, apply migrations and remove
only that newly created schema afterward. They check migration idempotency,
concurrent migration locking, checksum protection, transaction rollback,
conversation membership, duplicate messages, cross-conversation replies,
attachment restrictions, read states, call participants and soft deletion.
Authentication integration tests cover registration, duplicate races, login,
expiry, logout/revocation and concurrent database rate limits. To also test real
Next.js Server Action forms, cookies, redirects and cross-origin mutation rejection:

```bash
TEST_DATABASE_URL=postgresql://chatbit:local-password@127.0.0.1:5432/chatbit_test TEST_DATABASE_SSL=disable TEST_AUTH_HTTP=1 pnpm test
```

The HTTP harness starts its own server with an isolated output directory under
`.next/auth-http-test`, without stopping an existing development server. Tests
use temporary database schemas and never migrate the configured application
database. Full browser/device tests and realtime/upload/call integrations are
still unverified.
The audited baseline has two React effect lint errors and one accessibility
warning; these are recorded in the audit for subsequent UI work.

## Realtime, storage and WebRTC requirements

Realtime remains a future milestone. A persistent external WebSocket service
must authenticate connections, authorize every conversation subscription,
relay only committed events, deduplicate by event ID, and support reconnect
catch-up from PostgreSQL. Presence and typing need expiry and cleanup. A durable
outbox/shared infrastructure is required; an in-memory event emitter is not a
production delivery strategy. Hosting and free-tier limits must be documented
for the actual provider before deployment.

Uploads remain a future milestone. Use private object storage outside Vercel's
filesystem. The schema currently limits files to 10 MiB and JPEG/PNG/WebP/PDF/plain
text. Upload handlers must also inspect bytes and validate metadata; SQL MIME
checks alone do not establish file safety. Authorize upload, preview and download
access through current conversation membership. Never publish private bucket
URLs or return storage keys to unauthorized clients. Storage account/bucket
configuration is still required.

Calls remain a future milestone. WebRTC needs authenticated participant-only
signaling, STUN/TURN configuration, expiring TURN credentials, explicit media
permission handling and cleanup of every track/peer connection. TURN relays can
incur bandwidth costs; a suitable service or self-hosted coturn must be configured.
Calls cannot be claimed universally reliable without TURN and real-device tests.
Call-history tables alone do not establish a working call system.

## Vercel deployment

After completing the remaining milestones:

1. Configure the PostgreSQL runtime/migration roles and verified TLS endpoints.
2. Run migrations against a reviewed target; do not migrate during `next build`.
3. Configure Vercel with the pinned pnpm version, install with the frozen lockfile,
   build with `pnpm build`, and set server-only environment variables.
4. Provision and configure external WebSocket hosting, private storage and TURN.
5. Set `AUTH_RATE_LIMIT_SECRET`, run authentication and cross-account tests, and
   complete messaging, security headers and upload limits before opening the service.
6. Smoke-test two accounts, reconnects, private downloads and calls on real devices.

No deployment was performed by this milestone. Free infrastructure may sleep,
limit connections or storage, and provide no availability guarantee. Document
actual selected-provider limits. No AWS, paid service, ORM or Supabase is required
by the implemented PostgreSQL foundation.

Author: Md Biplob Hosain — [GitHub](https://github.com/Amibiplob).
