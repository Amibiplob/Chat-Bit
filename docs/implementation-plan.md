# Repository audit and implementation plan

Audited on October 14, 2026. No repository AGENTS.md was present. The installed
Next.js package includes AGENTS.md; its data-security guide was read before
adding server-side code. The worktree already contained a modification to
components/chat/conversation-list.tsx; that change is preserved and excluded
from milestone commits.

## Actual starting state

- Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind 4, Base UI/shadcn.
- Routes: landing, login, signup, forgot-password, chat, chat/[conversationId],
  contacts, calls and settings. Feature components preserve the existing design.
- Login/signup are forms without backend submit handlers. Application routes
  have no session checks. Password reset has a placeholder handler.
- Conversations, messages and calls come from static arrays. Send/edit/delete
  alter component state only; reply selection is not persisted into new messages.
- Call controls open a demonstration dialog; there is no WebRTC connection.
- Profile save displays a temporary success state; settings are component state
  except appearance, which uses localStorage. File buttons have no storage backend.
- No API handlers, database connection, migrations or tests existed.
- Git history removed Prisma/Supabase integration. Unused Supabase packages and
  documentation remained. Adding pg and removing those unused packages updated
  the existing pnpm lockfile. No secrets were printed.
- Baseline TypeScript passed. Baseline lint reported set-state-in-effect in the
  composer and appearance settings, plus an icon named Image triggering alt-text.

## Milestones

1. **Database foundation (this milestone):** additive relational schema, bounded
   verified-TLS pg pool, transaction helper, migration lock/checksums, internal
   membership-scoped message/attachment reads, unit and real PostgreSQL tests.
   These helpers are not exposed to clients or connected to mock UI yet.
2. **Authentication:** Argon2id, opaque random tokens with hashed session records,
   HTTP-only cookies, expiry/revocation, same-origin mutation protection, shared
   persistent rate limiting, validated forms, protected layout and route checks.
3. **Conversations/messaging:** authenticated user context at every API boundary,
   atomic direct-conversation creation, cursor pagination, persistent send/edit/
   soft-delete/reply/read flows and unread counts. Replace samples after testing.
4. **Realtime:** external persistent authenticated WebSocket service, conversation
   authorization, durable publication/outbox, event IDs, reconnect catch-up,
   typing expiry and presence lifecycle. Vercel hosts HTTP and UI only.
5. **Attachments:** private object storage adapter, validated sizes and content,
   authorized uploads/downloads, previews/progress, orphan cleanup. No local disk.
6. **Calls:** authenticated participant-only signaling, incoming/accept/reject UI,
   WebRTC lifecycle, controls, call history, STUN/TURN and real-device validation.
7. **Settings/profile/UI:** persistent preferences and profile updates, real user
   identity throughout navigation, loading/errors/empty states and mobile checks.
8. **Final checks:** security headers, request limits, cross-account tests,
   deployment documentation and production smoke tests. Commit each verified step.

## Dependencies and decisions still required

Production PostgreSQL credentials, private object storage configuration, external
WebSocket hosting and TURN service credentials are not provisioned by this
milestone. Existing local environment files are left untouched and are not used
for integration tests. Never migrate an unknown database automatically during a
build. Do not promise free-tier availability, no-card account signup, TURN
coverage or deployed reliability without checking the selected providers.

No deployed backend is verified. Authentication and later milestones remain open.

## Database milestone verification

- Real PostgreSQL 16.15 in an isolated temporary instance: 13 tests passed,
  including migration failure rollback and private-data access checks.
- TypeScript, ESLint for new server/scripts/tests code, and diff whitespace checks passed.
- Repository-wide lint retains the baseline two effect errors and one icon warning.
- `pnpm build` could not finish: sandbox font-fetch restrictions on the first
  attempt, then a Turbopack worker port restriction with network access.
- `pnpm exec next build --webpack` completed successfully, including TypeScript,
  static generation and build traces. Existing webpack cache warnings were emitted.
- No migration was run against the application's configured database. The UI
  remains a demonstration; the production database and later integrations are unverified.
