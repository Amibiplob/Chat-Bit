# Messaging and attachment failure investigation

The old exact message, “Messaging is temporarily unavailable. Please try again.”,
was emitted by `lib/server/messaging-http.ts` for every unexpected exception.
It was not evidence of a Supabase failure. No authenticated production failure
trace was available during this investigation, so the production root cause
remains unconfirmed. Applied migrations do not establish runtime connectivity,
role permissions, TLS trust, session resolution, or Storage availability.

## Request flow and failure boundaries

- Composer → `messagingRequest` → POST `/api/conversations/:id/messages` →
  origin check → session-cookie hash lookup → database-backed rate limiter →
  membership check and transactional message insert. `(sender_id, client_id)`
  prevents duplicate text submissions. Realtime sync/pagination delivers updates.
- Files → POST `/api/conversations/:id/attachments` → same auth/membership checks,
  quota reservation → private bucket validation → non-overwriting signed URL.
  Browser PUT uploads bytes directly to Storage, outside Vercel request bodies.
- POST `/api/conversations/:id/attachments/:id/complete` → ownership check →
  private Storage read → byte/type/size verification → transactional message and
  attachment persistence. Available reservations return their existing message ID.
- Downloads/previews check conversation membership and live message/attachment
  state. Documents use 60-second signed downloads; media uses the authorized,
  no-store content endpoint with range support. Anonymous access stays denied.

Confirmed defects fixed: a lost completion response previously caused client
DELETE even after successful commit; transient provider/database completion
failures invalidated pending reservations; upload XHR had no timeout; supplying
an abort signal disabled the API timeout. Retried completion now reuses the
same reservation and client ID while the same File remains queued. Pending
transient failures remain retryable until existing reservation expiry. Invalid
content is terminal and schedules cleanup. No success is shown before completion
returns. After refresh, cancellation during completion, or reselecting a file,
check conversation history before resubmission: in-memory retry state is not a
cross-device/outbox guarantee.

## Safe production diagnostics

Failed wrapped API requests emit `chatbit.messaging.failure` with only:
`operation`, `stage`, allowlisted `code`, `category`, generated `requestId`.
The response includes the same `requestId` and `X-Request-ID`. Cleanup failures
also emit safe events rather than disappearing. Provider/session causes retain only safe codes
for allowlisted classification; raw errors, SQL, parameters, headers, cookies,
URLs, object keys, project IDs, certificates and credentials are never logged.
Expected validation/auth/size/quota responses retain their public explanations;
timeouts return 504, unexpected internal errors 500, and unavailable database or
Storage operations 503. Provider HTTP codes identify Storage credential/limit
failures without exposing provider messages. TLS verification remains enabled.

For a failed attempt collect the UTC time, method, route **template** (replace
all identifiers), actual HTTP status, response requestId and the matching
`chatbit.messaging.failure` fields above. Identify whether the failing request
was reserve, browser Storage PUT, complete, message POST, or delivery GET. A PUT
failure has no application requestId: provide status, elapsed time, whether it
was aborted/timed out, and only a redacted provider error **code**, never its URL
or full response. Do not share HAR files, cookies or raw Vercel error objects.
For an older deployment without these events, provide the matching event's safe
SQLSTATE/TLS/network code if present; do not infer a cause from status alone.

## Production configuration and deployment verification

In Vercel's **Production** environment, verify names and validity without sharing
values; confirm which Git commit is attached to the active production deployment.
No Vercel settings, credentials, data, migrations or deployments were changed.

- `DATABASE_URL`: runtime pooled PostgreSQL endpoint with the intended restricted
  DML role and access to ChatBit tables. A successful `DATABASE_MIGRATION_URL`
  migration does not verify this endpoint or role.
- `DATABASE_SSL=verify` (or default), provider-required `DATABASE_SSL_CA` in PEM
  form, no URL `ssl*` parameters or `uselibpqcompat`. Keep certificate verification
  on; never use `NODE_TLS_REJECT_UNAUTHORIZED=0`. Pool defaults to 3 per instance.
- `AUTH_RATE_LIMIT_SECRET`: at least 32 characters, stable across instances.
  Custom sessions use secure `__Host-` HttpOnly cookies in production; mutations
  require the same origin/host. Database-backed session verification fails closed.
- Server-only `SUPABASE_URL` HTTPS endpoint, `SUPABASE_SECRET_KEY`, and private
  `SUPABASE_STORAGE_BUCKET` (default `chatbit-attachments`). No public bucket or
  public read policy. Bucket file cap must be positive and at most 10 MiB; use
  10 MiB for the full advertised limit. The application account quota is 100 MiB,
  including worst-case reservations. A smaller bucket cap lowers actual limits.
- Existing authenticated attachment cleanup scheduling and secrets must be active.
  Do not weaken authorization, RLS, bucket privacy or overwrite prevention.

Read-only public checks returned 200 for login/manifest and 401 for anonymous
conversation listing. These checks do not identify the exact deployment SHA or prove live messaging.
The local shape preflight passed database/auth/Storage checks but flagged TURN
configuration; local values are not evidence of Vercel Production settings.

After an approved deployment, the owner must verify the deployed SHA and use an
authorized test environment/two test accounts for text, photo, ≤10 MiB supported
video, document upload/download, denied third-party access, cancellation, lost
completion response/retry, and delivery recovery. No automated tests should
write into production. Live Supabase upload/download and authenticated
production messaging remain unverified; provider integration here uses mocks.

## Verification for this change

- `pnpm test` with disposable loopback PostgreSQL 17 and the isolated security
  fixture: 157 passed, 0 failed, 1 skipped (separate HTTP suite).
- Standalone Next.js HTTP/Chrome suite was not rerun in this verification pass.
  An existing local log records 16 passing tests from an earlier pass; that is
  separate from the freshly rerun isolated suite above.
- Attachment/client/diagnostic regressions pass within the full suite. Storage
  provider tests are mocks, not a live Supabase upload/download claim.
- TypeScript and ESLint passed. The production Webpack build passed outside
  sandbox subprocess restrictions; the first sandbox build failed while parsing
  TypeScript CLI configuration output. `git diff --check` passed. The protected
  conversation-list edit is excluded.
- An initial isolated test connection used a nonexistent fixture role and failed;
  the successful rerun used a fresh disposable PostgreSQL 17 cluster and explicit
  test role. No production database was accessed.
