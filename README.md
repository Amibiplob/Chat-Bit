# ChatBit v1.0.0

ChatBit is a responsive messaging application built with Next.js and Neon
PostgreSQL. It combines direct conversations, private file sharing, and browser
voice/video calls in an installable web app, with server-enforced access controls
and an account-scoped workspace.

**Live website:** [chat-bit-rouge.vercel.app](https://chat-bit-rouge.vercel.app)

## Features

- Email/password authentication with Argon2id and server-managed sessions.
- Contact discovery and one-to-one conversations with PostgreSQL polling,
  presence, typing indicators, replies, edits, deletion, and read receipts.
- Private photo, video, audio, and document sharing with previews and downloads.
- One-to-one WebRTC voice/video calls and call history.
- Profile details, avatars, password/session controls, and notification/privacy
  preferences. Saved-message markers stay in the current browser.
- Light, dark, and system themes; responsive layouts and browser PWA installation.

## Technology

Next.js 16.4.2 App Router, React 19.2.9, TypeScript, Tailwind CSS 4, Base UI, and Zod.
Server code uses `pg` with Neon PostgreSQL, Neon Object Storage through the AWS
S3 SDK, and native WebRTC APIs. Avatars are stored in PostgreSQL; attachments use
private object storage. Vercel hosts the web application.

## Architecture

```text
Browser / installed PWA
  ├─ Persistent workspace, private RAM cache, drafts and optimistic text outbox
  ├─ Server Actions and authenticated API routes → Neon PostgreSQL
  ├─ Signed uploads → private Neon Object Storage → verified completion
  └─ WebRTC audio/video ↔ peer, with authorized PostgreSQL signaling and STUN/TURN
```

App Router pages authorize direct URLs on the server. Route Handlers validate
sessions, conversation membership and ownership before data access; PostgreSQL
transactions provide durable writes and idempotent message submission. Private
messages are never placed in a shared server cache or service-worker cache.
[Architecture and behavior details](docs/persistent-workspace.md).

## Mobile experience and navigation

The authenticated shell keeps the sidebar, mobile tabs and call controls mounted
while moving between Chats, Contacts, Calls and Settings. Visited workspace panels
retain their state. Recently loaded conversations use a bounded, account-scoped
RAM cache, preserving drafts and reading position without a document reload.
Uncached conversations still use authorized server navigation and honest loading
feedback. Logout, account changes and session rejection discard private state.

Phone layouts provide a separate conversation screen, attachment picker, emoji
controls, touch message actions, and a full-screen media viewer. Dynamic viewport
height and safe-area spacing accommodate browser chrome and resized keyboards.
Automated viewport checks complement the real-device checklist; they cannot prove
Android keyboard or system Back behavior on every device.

## Messaging, files and calls

Accepted outgoing text appears locally as **Sending…** before its request completes.
A stable submission ID prevents duplicates after retries or lost acknowledgements;
a failed send remains visible with a retry action. Local display, durable server
acknowledgement and recipient display are separate stages. Newer drafts survive
failed sends, and pending text survives conversation switching within the session.

PostgreSQL polling is the default recipient-delivery transport. It runs more
frequently after activity, slows when idle, suspends when offline/hidden unless
background notifications are explicitly enabled, and resynchronizes on return.
There is no guaranteed delivery latency or closed-app push. The optional Ably
integration already in the repository remains opt-in and is not activated by setup.

The attachment picker supports approved images, MP4/WebM, audio and documents,
including PDF and Office formats. Uploads show progress, support cancellation and
retry, and only become messages after server verification. Membership-protected
media routes and short-lived downloads keep the storage bucket private. Browser
codec support varies. Voice/video controls support accept/reject, mute, camera
toggle and hangup; media tracks are released when calls end or sessions are rejected.

## Local development

Use **Node.js 24.22.1** (`nvm install && nvm use`) and **pnpm 12.3.4**. Clone the repository, enter its directory,
then install dependencies and create a local configuration file:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Fill in `.env.local` using the settings below. Next.js and the CLI scripts prefer
`.env.local` over `.env`; inherited process variables take precedence. Restart the
development server after configuration changes. Never commit credentials or put
server secrets in `NEXT_PUBLIC_` variables.

### Environment configuration

[`.env.example`](.env.example) lists supported variables with placeholders.
[Environment reference](docs/environment.md) explains validation and optional settings.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon runtime connection. |
| `DATABASE_MIGRATION_URL` | Direct connection to the same branch, database, and owning role. |
| `DATABASE_SSL`, `DATABASE_POOL_MAX` | Verified TLS and per-instance pool size; defaults are `verify` and `3`. |
| `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | Exact branch storage endpoint and S3 signing region returned by Neon. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Scoped storage credential: `token_id` and `s3_secret_access_key`. |
| `NEON_STORAGE_BUCKET` | Private attachment bucket; defaults to `chatbit-attachments`. |
| `AUTH_RATE_LIMIT_SECRET` | Independent random secret for shared authentication/API rate limits. |
| `CRON_SECRET` | Independent secret for authenticated GET cleanup jobs. |
| `CHATBIT_REALTIME_PROVIDER`, `ABLY_API_KEY` | Optional `ably` invalidation hints; empty provider uses polling only. |
| `CALL_STUN_URLS`, `CALL_TURN_URLS`, `CALL_TURN_SHARED_SECRET` | ICE configuration; TURN is needed for reliable cross-network calling. |

Generate independent secrets of at least 32 characters, for example with
`openssl rand -hex 32`. Optional POST cleanup secrets, relay-only mode, and
isolated-test settings are documented in the environment reference.

### Neon PostgreSQL

1. Select a fresh development database and its owning role in Neon.
2. Set the pooled runtime URL and matching direct migration URL. Keep verified TLS
   enabled. Remove the libpq `channel_binding` URL parameter; `pg` negotiates
   channel binding through its driver configuration.
3. Review the target before running migrations. This command **writes to the
   configured database**; do not point it at a live database unintentionally:

   ```sh
   pnpm db:migrate
   ```

4. Optionally check connection, migration history, and permissions without writes:

   ```sh
   node scripts/check-database.mjs
   ```

Migrations run explicitly, never during build or startup. The runner applies
pending migrations transactionally and records checksums; matching migrations
are skipped on rerun. Do not edit previously applied migration files.

### Neon Object Storage

Create or select a private attachment bucket on the intended branch. Use its exact
S3 endpoint and signing region, plus a scoped `storage:write` credential that
includes reads. A Neon management API key is not a runtime storage credential.
The application does not create buckets or change their visibility.

Configure bucket CORS for the exact development and deployed origins with
POST/GET/HEAD and Content-Type; do not use wildcard origins. After configuring it,
run the read-only metadata/CORS check for your intended browser origin:

```sh
node scripts/check-storage.mjs http://localhost:3000
```

See [file sharing](docs/file-sharing.md) for upload validation and access controls.

### Run the application

```sh
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Development uses Turbopack.
`pnpm config:check` checks production configuration shape without accessing Neon;
it requires release settings such as TURN and cleanup secrets, even when those
services are not needed for a local UI check.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start development with Turbopack. |
| `pnpm build` | Create the production build with Webpack. |
| `pnpm build:turbo` | Create a production build with Turbopack. |
| `pnpm start` | Serve an existing production build. |
| `pnpm lint` | Run ESLint. |
| `pnpm exec tsc --noEmit` | Check TypeScript without emitting files. |
| `pnpm test` | Run unit tests and configured opt-in integration/browser tests. |
| `pnpm db:migrate` | Apply migrations to the selected database. |
| `pnpm config:check` | Validate production configuration shape without network access. |

## Testing

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Database suites require `TEST_DATABASE_URL` pointing only to a disposable database.
They create schemas, migrate, write fixtures, and clean up. Loopback PostgreSQL
may use `TEST_DATABASE_SSL=disable`; hosted connections require verified TLS.
Set `TEST_AUTH_HTTP=1` and `CHROME_BIN` for authenticated HTTP/Chrome journeys;
`TEST_NEXT_TURBOPACK=1` selects Turbopack for that test server. Unconfigured suites
are skipped, so a default test pass does not imply integration coverage.

[The verification workflow](.github/workflows/verify.yml) provisions disposable
PostgreSQL, prepares the security fixture, and runs integration, browser,
typecheck, lint, dependency-audit, build, and production PWA checks. Browser
coverage includes portrait/landscape layouts and delayed-send recovery. See
[runtime regressions](docs/runtime-regressions.md),
[browser checks](docs/browser-ci-verification.md), and the
[manual release checklist](docs/manual-test-plan.md) for additional coverage.
Local tests do not prove deployed Neon, storage CORS, TURN, or real-device behavior.

### Local performance evidence

The final isolated PostgreSQL 17/Turbopack/Chrome run measured the following on a
loopback development server. These small samples are not production guarantees;
optimistic display is separate from persistence and recipient delivery.

| Stage | Samples | p50 | p95 |
| --- | --- | --- | --- |
| Click to optimistic display | 12 | 19 ms | 76 ms |
| Send request to server acknowledgement | 12 | 97 ms | 869 ms |
| Click to recipient display | 12 | 952 ms | 1,343 ms |
| Warm cached chat switching | 10 | 27 ms | 39 ms |

Cached switches made zero RSC requests and caused zero shell remounts. The first
uncached chat measured 516 ms to content in one local sample. A native WebRTC
controller simulation reached remote media in 2,109 ms in one local sample.
See the [verification evidence](docs/production-readiness.md#verification-evidence)
for scope and limitations. Physical mobile-keyboard responsiveness is unverified.

## Install as a PWA

Open the HTTPS website in a supported browser. Use **Install app** or
**Add to Home screen** in Chrome/Edge, or Safari's **Share → Add to Home Screen**
on iPhone/iPad. An in-app install option appears when the browser supports it.
The installed app uses the same website, accounts, and backend; no APK is needed.
Only a public connection-recovery page is cached. Chats and private media need
a network connection. See [PWA behavior](docs/pwa.md).

## Security and limitations

Session tokens are random, stored hashed in PostgreSQL, and sent in HTTP-only
cookies with secure production settings. Parameterized queries, server-side
membership/ownership checks, origin validation, rate limits, and database grants
protect application operations. Attachments use private storage, short-lived
signed uploads, server byte validation, and authorized download routes.
See [authentication](docs/authentication.md) and
[database security](docs/database-security.md).

- Messages are **not end-to-end encrypted**; the server stores their contents.
- Attachments are limited to 10 MiB per file and 100 MiB per uploader.
- Updates use polling by default. Optional Ably invalidations require manual
  configuration and hosted acceptance testing; recovery polling remains enabled.
  No hosted push service was activated or verified in the final audit.
  Latency, background throttling and usage depend on networks and active tabs.
- Calls require HTTPS or trusted loopback, browser media permissions, both people
  online, and suitable STUN/TURN infrastructure. Same-machine tests do not prove
  cross-network reliability. Group calls, screen sharing, recording, closed-app
  push, native background calling, and an offline outbox are unavailable.
- Password recovery, MFA, blocking, and self-service account deletion are unavailable.
- Backups and cleanup scheduling are not provisioned by this repository.
- One high-severity `braces` advisory remains in development tooling with no
  published fix. ESLint 9 is end-of-life while required plugins exclude ESLint 10.
  See the [dependency security review](docs/dependency-security.md).

See [calling](docs/calling.md) for TURN setup, lifecycle limits, and device checks.

## Project structure

```text
app/          App Router pages, layouts, Server Actions, and API routes
components/   Authentication, messaging, calling, settings, and shared UI
lib/          Client utilities, validation, types, and server data access
db/          Checksum-tracked PostgreSQL migrations
public/       PWA assets, theme bootstrap, and bundled fonts
scripts/      Migration, configuration, storage, database, and browser checks
tests/        Unit, PostgreSQL, HTTP, browser tests, and fixtures
docs/         Architecture, setup, security, and manual verification guides
.github/      CI verification workflow
```

## Deployment

Configure equivalent server-only values in the intended Vercel environment, use
Node.js 24 LTS (local/CI pin: `.nvmrc`) and pnpm 12.3.4, install with the frozen lockfile, and build with
`pnpm build`. Apply reviewed migrations separately before releasing code that
needs them. Configure private bucket CORS and an external authenticated cleanup
scheduler: calls every minute, attachments every five minutes, maintenance hourly.
A daily-only scheduler cannot meet these cadences.

Follow the [deployment guide](docs/deployment.md) and
[production-readiness checklist](docs/production-readiness.md), then test two
accounts on real devices and different networks. Deployment and production
acceptance are separate from a successful local build.

## Final handoff

The implementation and local verification are complete for this project phase.
See the [final production handoff](docs/production-readiness.md) for measured
results, remaining release prerequisites and critical-failure recovery steps.
Production acceptance still requires the intended deployment commit, real private
uploads/downloads, two devices on different networks, TURN, and browser installation.
No production data or credentials were changed, and no deployment was performed.

Before launch, run `pnpm config:check`, confirm the intended database migration
history and private bucket CORS, configure cleanup scheduling, then complete the
[two-account/device checklist](docs/manual-test-plan.md). Confirm the deployed
commit and Node runtime after your manual push and deployment.
