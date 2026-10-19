# Repository cleanup — 2026-10-17

## Audit and changes

The audit covered tracked source files, App Router conventions, TypeScript and
JavaScript imports/re-exports, dynamic imports, CommonJS references, scripts,
tests, configuration, GitHub Actions, documentation, public assets and the pnpm
lockfile. Route/layout/error/loading files were treated as framework entry points,
not as unused modules. No computed component loaders were found.

Removed eight modules with no consumers outside their obsolete component group:

- `components/calls/call-data.ts`
- `components/calls/call-empty-state.tsx`
- `components/calls/call-list-item.tsx`
- `components/calls/call-list.tsx`
- `components/calls/calls-header.tsx`
- `components/chat/empty-chat-state.tsx`
- `components/conversation/typing-indicator.tsx`
- `components/ui/card.tsx`

The removed Calls group rendered hardcoded call history. The active `/calls`
route uses `calls-page.tsx`, authenticated APIs and the calling provider. The
active chat page supplies its own empty state, and typing status is rendered by
the conversation header. No active UI, API handler or authorization code changed.

Removed unused direct dependencies `@hookform/resolvers`, `react-hook-form` and
`zustand` using pnpm offline with lifecycle scripts disabled. They had no imports
or configuration/script/test/CI consumers. The lockfile prunes their unused
dependency records; remaining package versions were not upgraded.

Expanded `.gitignore` for local certificates/credentials, database exports and
encrypted backup archives, test output and tool caches. Existing private files
and build/cache directories were not deleted. Store other private backup formats
under the ignored root `backups/` directory.

## Deliberately preserved

- The user-owned `components/chat/conversation-list.tsx` edit, including its
  dependency on `components/conversation/conversation-data.ts`. That mock-data
  module is a later cleanup candidate after the user resolves the protected edit.
- `lib/server/conversations.ts`: no current consumers were found, but it contains
  session-scoped server wrappers. Review it separately with its protected query
  utilities rather than folding security-sensitive changes into UI cleanup.
- Every route, migration 001–008, migration runner, security test, workflow,
  authentication/session module, realtime/messaging module, attachment/cleanup
  module, Supabase integration and WebRTC/TURN implementation.
- Deployment configuration and operational/security documentation, including
  dated reports whose pending items describe their original verification scope.
- All public assets: the logo, local fonts, licenses and favicon have consumers
  or framework/license requirements. The landing page showcase is intentional
  product illustration, not an abandoned authenticated data source.
- `shadcn`, `tw-animate-css`, Tailwind and Base UI: CSS/configuration and active UI
  need them. React DOM is a framework dependency. Build-script deny rules and
  the source-map override remain unchanged.
- `.env`, `.env.local`, certificates, credentials and any private backups.

## Verification boundary

Results after cleanup:

- `pnpm install --frozen-lockfile --offline --ignore-scripts`: passed.
- `pnpm test`: 66 tests, 56 passed, zero failures, 10 database-dependent suites
  skipped. Security, backup, authentication, messaging, attachment, realtime,
  calling, settings and configuration unit checks passed.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` (Webpack), and
  `git diff --check`: passed. Checks ran with subprocesses permitted outside the
  restricted sandbox.
- A temporary production server on loopback, with database/storage credentials
  explicitly unset, served four public pages and four assets. Four protected
  pages redirected signed-out requests to login; three protected APIs returned
  401. Real Chrome rendered the login form and landing-page logo successfully.
  No mutation requests were sent.
- All 143 checked protected source/configuration/asset files retained their
  starting-worktree hashes, including the conversation-list user edit, all eight
  migrations, workflows, routes, tests and server modules.
- Git ignore checks covered representative environment, certificate, credential,
  backup, cache and test-output paths. `.env.example` and migrations remain
  trackable. The pnpm lockfile change contains deletions only, with no dependency
  version additions or upgrades.

No disposable PostgreSQL server or test-database configuration was available.
Production Supabase is not an integration-test target. Local checks cannot prove
live transfers, cross-network calls, scheduled cleanup or deployed authentication.
No production database, backup, migration, deployment or push was performed.

## Neon preparation audit — 2026-10-19

Android sources, scripts and release workflows were already retired in earlier
commits (see chatbit-3.md). Removed the remaining ignored android/generated and
android/node_modules trees; no signing directory or credentials were present.
Only verify.yml and backup-database.yml remain; they serve distinct validation
and recovery purposes and are retained. Browser PWA files and icons remain.

Expanded ignore protection to arbitrary SQL exports and compressed archives,
with explicit migration and test-fixture exceptions. Tracked-file pattern scans
found only documented/test connection placeholders and synthetic secret-key
fixtures; no confirmed credential was found. This is a pattern audit, not proof
that no historical secret has ever existed. The protected conversation-list edit
and its mock-data dependency remain untouched. No additional dependency removal
is justified by the current import/configuration audit.

The final integration audit also removed the unreferenced
lib/server/conversations.ts wrapper and its now-unused withTransaction export
from db.ts. Active messaging/attachment services already use their own scoped
queries and transaction helper. conversation-queries.mjs remains covered by
private-data security tests. The earlier deliberately-preserved list above is a
historical snapshot, not a claim that the removed wrapper is still present.
