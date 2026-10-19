# ChatBit

A mobile-first Next.js PWA with custom Argon2id authentication, PostgreSQL sessions,
contacts, private conversations, messaging/read receipts, attachments, profile
avatars, settings/themes and browser WebRTC calls. Neon PostgreSQL and private
Neon Object Storage are the only hosted data services. Vercel hosts the web app.
There is one browser-installable application and no Android build tooling.

## Start

Use Node.js 24 and pnpm 12.3.4:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Fill the server-only values in [environment.md](docs/environment.md). When you have
reviewed and explicitly selected your fresh Neon database, initialize it once:

```sh
pnpm db:migrate
node scripts/check-database.mjs
pnpm config:check
pnpm dev
```

The migration command changes the selected database; builds/startup never run it.
Migration files 001–008 remain unchanged and checksum-tracked. Rerunning the runner
skips matching applied files. No old accounts, messages or files are imported.
The live database has not been initialized or accessed by this work.

## Verify and deploy

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

[Deployment](docs/deployment.md) covers fresh setup, private bucket CORS, authenticated
cleanup and manual acceptance. [Production readiness](docs/production-readiness.md)
distinguishes isolated checks from live-provider/device verification. Configure
matching local/Vercel values and redeploy yourself. No push/deployment is automatic.
Backups are intentionally not configured at the owner's request.

## Architecture

Next.js App Router serves React/TypeScript UI and server APIs. Parameterized pg
queries enforce sessions, conversation membership and authorship; database RLS
and grants isolate the owning server role. Browser clients receive no database
or storage secret. Attachments use signed forms, server byte validation and
server-owned sealed objects. Avatars remain small private PostgreSQL bytea records.
Revision polling delivers messages; WebRTC uses authorized database signaling
and your STUN/TURN configuration. The worker caches only the public offline page.

See [authentication](docs/authentication.md), [database security](docs/database-security.md),
[messaging](docs/messaging.md), [realtime](docs/realtime.md),
[file sharing](docs/file-sharing.md), [calling](docs/calling.md),
[settings](docs/settings.md) and [PWA](docs/pwa.md).
