# ChatBit

ChatBit is a portfolio communication application with an existing responsive
landing page, authentication screens, chat interface, calls page and settings.
Conversations and text messages persist in PostgreSQL. Registration, login,
logout and protected application routes use secure database-backed sessions.
Incoming messages, edits, deletions, receipts and chat previews update
automatically, with presence and typing indicators. Delivery uses authenticated
two-second HTTP synchronization, not WebSocket push. Calls and profile/settings
still contain demonstration behavior; uploads and WebRTC remain future milestones.

## Stack and architecture

Next.js App Router 16.3.4, React 19.2.8, TypeScript, Tailwind CSS 4,
Base UI/shadcn, and PostgreSQL accessed with direct parameterized SQL using `pg`.
No ORM or Supabase integration is used by the new backend.

The current deployment architecture has Next.js UI/HTTP APIs on Vercel and a
PostgreSQL database. Transactional revisions and authoritative snapshots provide
automatic updates without a separate persistent server or managed pub/sub key.
Private object storage and WebRTC remain future work. See
[realtime setup, recovery and usage limits](docs/realtime.md).

Server-only modules live in `lib/server`. The database pool initializes lazily,
uses a small connection limit and verifies TLS certificates. Transactions acquire
one pg client and release it after commit/rollback. Internal message and file
queries join conversation membership before returning private data. These
server-only wrappers derive the user ID from a validated session on every data
access; callers cannot supply an arbitrary user ID. Authenticated HTTP routes
expose scoped message/conversation DTOs, with no-store responses and origin
checks on mutations. See [persistent messaging](docs/messaging.md). SQL is parameterized and credentials are never logged.

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
The chat UI reads and writes PostgreSQL; call UI and profile/settings persistence
remain unfinished. See [authentication setup and security](docs/authentication.md)
and [automatic messaging](docs/realtime.md).

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
Migration 003 adds transactional realtime revisions and session-bound activity
leases. It retains existing accounts/messages. Review and apply it before using
the automatic-update build; no application database was migrated by this work.

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
closed. Realtime uses these existing variables without a new provider account.
File storage and TURN configuration remain future work.

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
expiry, logout/revocation and concurrent database rate limits. Messaging tests
cover conversation races, author/membership authorization, idempotent sends,
replies, edits, soft deletion, cursor pagination and read/unread state. To also test real
Next.js Server Action forms, cookies, redirects and cross-origin mutation rejection:

```bash
TEST_DATABASE_URL=postgresql://chatbit:local-password@127.0.0.1:5432/chatbit_test TEST_DATABASE_SSL=disable TEST_AUTH_HTTP=1 pnpm test
```

The HTTP harness starts its own server with an isolated output directory under
`.next/auth-http-test`, without stopping an existing development server. Run
production builds and HTTP tests sequentially, because build cleanup can remove
the nested test output directory. Tests use temporary database schemas and never migrate the configured application
database. To run the additional browser checks, add `CHROME_BIN` pointing to an installed
Chrome/Chromium binary (for example `/usr/bin/google-chrome`) to that test command.
They use a separate temporary browser profile and no additional package. Browser
checks cover refresh persistence, editing, failed-send draft retention, pagination,
deleting and mobile navigation/overflow. Broader real-device and
deployed delivery, upload and call integrations remain unverified. Realtime tests
cover automatic incoming delivery, editing/deletion, read synchronization,
reconnection, new conversations and unread previews, plus isolated lease/rate tests.
The audited baseline has two React effect lint errors and one accessibility
warning; these are recorded in the audit for subsequent UI work. Messaging
integration resolves the composer issues; full lint still reports the unrelated
effect error in `components/settings/appearance-settings.tsx`.

## Realtime, storage and WebRTC requirements

Automatic messaging uses short authenticated HTTP requests. Visible tabs poll
every two seconds, pause while hidden, and recover a database snapshot after
disconnects. Presence leases expire after 25 seconds, typing after six seconds.
No keystroke history is stored. This is intended for a small portfolio application:
each visible tab uses about 1,800 sync invocations/hour. See [the architecture
decision and deployment limits](docs/realtime.md) before deploying on a free plan.

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
4. Budget synchronization/database usage and configure private storage and TURN
   when their milestones are implemented.
5. Set `AUTH_RATE_LIMIT_SECRET`, run authentication and cross-account tests, and
   verify deployed automatic delivery, security headers and upload limits before opening the service.
6. Smoke-test two accounts, reconnects, private downloads and calls on real devices.

No deployment was performed by this milestone. Free infrastructure may sleep,
limit connections or storage, and provide no availability guarantee. Document
actual selected-provider limits. No AWS, paid service, ORM or Supabase is required
by the implemented PostgreSQL foundation.

Author: Md Biplob Hosain — [GitHub](https://github.com/Amibiplob).
