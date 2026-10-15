# ChatBit

ChatBit is a portfolio communication application with an existing responsive
landing page, authentication screens, chat interface, calls page and settings.
Conversations and text messages persist in PostgreSQL. Registration, login,
logout and protected application routes use secure database-backed sessions.
Incoming messages, edits, deletions, receipts and chat previews update
automatically, with presence and typing indicators. Delivery uses authenticated
two-second HTTP synchronization, not WebSocket push. One-to-one voice/video calls use WebRTC with authenticated HTTP signaling.
Profile/settings still contain demonstration behavior; secure attachments use
private Supabase Storage.

## Stack and architecture

Next.js App Router 16.3.4, React 19.2.8, TypeScript, Tailwind CSS 4,
Base UI/shadcn, and PostgreSQL accessed with direct parameterized SQL using `pg`.
No ORM is used. Supabase is used exclusively for private file storage; the existing
PostgreSQL database and custom authentication remain in place.

The current deployment architecture has Next.js UI/HTTP APIs on Vercel and a
PostgreSQL database. Transactional revisions and authoritative snapshots provide
automatic updates without a separate persistent server or managed pub/sub key.
Secure file sharing uses private Supabase Storage; calling uses native WebRTC
and PostgreSQL signaling. See
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
The chat UI reads and writes PostgreSQL and supports calls; profile/settings
persistence remains unfinished. See [authentication setup and security](docs/authentication.md)
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
Attachment-only messages use an automatically generated filename caption.
Migration 004 adds attachment reservations, cleanup state and realtime revisions.
Review and apply it before using file sharing.
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
File storage requires the Supabase variables below. TURN remains future work.

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

Secure attachments support images, PDFs, text/Office documents, audio and video,
with progress/cancellation, previews, playback, downloads and uploader deletion.
The application enforces a 10 MiB file limit and 100 MiB per-uploader quota with
serialized reservations. Files stay available until intentionally deleted,
subject to provider retention and authorization. See [file-sharing setup,
architecture, cleanup, security and limitations](docs/file-sharing.md).

Create the private `chatbit-attachments` bucket with a 10485760-byte limit.
Configure server-only `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and
`SUPABASE_STORAGE_BUCKET`. Configure `ATTACHMENT_CLEANUP_SECRET` (32+ characters)
and a scheduled authenticated POST to `/api/attachments/cleanup`. Review and run
migration 004 separately from deployment. Environment files are not changed by
this milestone; use private configuration, never NEXT_PUBLIC secrets.

One-to-one voice and video calls now use native WebRTC and authenticated bounded
PostgreSQL signaling. Conversation headers and the Calls page support incoming
calls, accept/decline, mute, camera controls, termination and persisted history.
Review migration 005 before deploying. See [calling setup and security](docs/calling.md).

STUN defaults to `stun:stun.l.google.com:19302`. Configure `CALL_STUN_URLS`,
`CALL_TURN_URLS`, `CALL_TURN_SHARED_SECRET` and optionally `CALL_RELAY_ONLY` on
the server. TURN uses one-hour credentials; the shared secret never reaches the
browser. Configure `CALL_CLEANUP_SECRET` and a scheduled authenticated POST to
`/api/calls/cleanup`. STUN alone cannot connect every network. No TURN provider
is provisioned or verified by this milestone; real-device/cross-network tests
remain required. Calls are capped at 55 minutes and require HTTPS or loopback.

## Vercel deployment

Before deploying:

1. Configure the PostgreSQL runtime/migration roles and verified TLS endpoints.
2. Run migrations against a reviewed target; do not migrate during `next build`.
3. Configure Vercel with the pinned pnpm version, install with the frozen lockfile,
   build with `pnpm build`, and set server-only environment variables.
4. Budget synchronization/database usage and configure private Supabase Storage and its cleanup scheduler; configure TURN
   for cross-network calling.
5. Set `AUTH_RATE_LIMIT_SECRET`, run authentication and cross-account tests, and
   verify deployed automatic delivery, security headers and upload limits before opening the service.
6. Smoke-test two accounts, reconnects, private downloads and calls on real devices.

No deployment was performed by this milestone. Free infrastructure may sleep,
limit connections or storage, and provide no availability guarantee. Document
actual selected-provider limits. Supabase Storage is required for attachments; PostgreSQL and custom auth remain
independent. No deployment or live Supabase verification was performed.

Author: Md Biplob Hosain — [GitHub](https://github.com/Amibiplob).
