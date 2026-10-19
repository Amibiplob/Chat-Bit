# Persistent conversations and messaging

Milestone 3 connects the existing chat interface to PostgreSQL. It uses the
existing migrations 001 and 002 without altering them or introducing another
migration. Against a reviewed, configured database, run `pnpm db:migrate` before
using the application. No configured application database was migrated by this
milestone; tests use temporary isolated schemas.

## Architecture and behavior

Server Components load the current user's conversation list and the selected
conversation's newest message page. Existing conversation header, area, bubble
and composer components now consume typed database DTOs. HTTP endpoints handle
user search, conversation creation, message operations, pagination and read state.
The server-only DAL resolves the current session for every operation; internal
SQL helpers use the shared pg pool and transaction utility.

The existing conversation-list.tsx contains a user-owned edit and remains untouched.
The active sidebar uses persistent-conversation-list.tsx with the same row/avatar
styling. Legacy sample data remains for that preserved file, but active chat
routes no longer import sample conversations or messages. Other product pages
were not redesigned. The composer effect/alt-text lint issues were fixed while
integrating asynchronous submission; the unrelated appearance-settings effect
error remains.

Conversations are direct pairs of existing users. Canonical UUID ordering and
the existing unique pair constraint prevent duplicates; creating the same pair
concurrently returns the same conversation ID. Creation and both memberships
commit in one transaction. Self-conversations and unknown recipients are rejected.
The sidebar supports name/latest-message filtering, an unread filter, real unread
counts, latest-message previews, timestamps and selected-row styling.

New Conversation searches display names or an exact email, excluding oneself and
returning at most 20 public display-name/ID pairs. Email addresses, password hashes
and session data are never returned. This is an authenticated user directory, not
a private contact list; users can discover public names or test an exact known
email. Names need not be unique. Groups, pinning and presence are not implemented.

Messages contain 1–10,000 trimmed characters. The composer retains drafts on
failure and disables submission during a request. Each new-message attempt uses
a UUID client ID; retrying the same payload uses the same ID. The unique
(sender_id, client_id) constraint makes concurrent retries idempotent. Reusing
a key for a different body, reply or conversation returns a conflict. A confirmed
save clears the draft even if the subsequent refresh fails; the UI reports that
the saved update needs refreshing.

Only authors can edit or delete. Edits update the current body and edited_at;
there is no edit-history table or optimistic version check (concurrent edits use
the last committed update). Deletion sets deleted_at and retains the database row
and original body. DTOs, reply quotes and list previews never expose deleted
bodies. Deleted messages show a placeholder and cannot be edited or replied to.
Reply targets must be live messages in the same authorized conversation.

Pagination fetches 50 messages by default, up to 100, using (created_at, id) keyset
cursors. SQL emits six fractional timestamp digits, preserving PostgreSQL
microseconds so messages in the same millisecond are not skipped. Pages display
oldest first; Load older messages prepends rows, avoids duplicate IDs and preserves
scroll position. Dates are persisted in UTC; message clocks use browser local
time and date separators show the persisted UTC calendar date.

Once a conversation is visible in the browser, read updates acknowledge only
the incoming, nondeleted messages currently loaded into its thread. Batches are
bounded at 100, deduplicated and checked against the conversation. Loading a page
on the server does not mutate read state. Own messages never create a recipient
receipt. Newly arrived/unloaded messages stay unread. Sender read indicators
reflect actual recipient read rows. Unread counts exclude deleted messages.

## Authorization and request boundaries

- Session validation runs inside the DAL, independently of page/layout guards.
- Every message read/write verifies conversation membership in the transaction.
- Edit/delete SQL additionally restricts sender_id to the authenticated user.
- The actor is derived from the session, never from a body/query user ID.
- UUIDs (normalized for case), content, recipients, cursors, search text and read
  batches are validated server-side with Zod.
- Conversation creation requires another existing user; membership foreign keys
  and the direct-member trigger remain an additional database safeguard.
- Replies cannot point into another conversation, and mixed-conversation read
  batches are rejected atomically.
- All SQL values are parameters. User-search wildcard characters are escaped.
- Mutations require matching Origin/Host, including DELETE; there is no mutation
  via GET. JSON bodies are streamed with a 64 KiB limit and explicit content type.
- Unauthorized API requests return 401; missing/nonmember resources and another
  author's messages share a generic 404. Unexpected errors return a safe 503.
- API responses use Cache-Control: no-store. No raw credentials or private
  account fields are returned or logged by these endpoints.

Endpoints:

| Method and path | Purpose |
| --- | --- |
| GET /api/users?q=... | Authenticated public-name/exact-email lookup |
| GET /api/conversations | Current member's conversation list |
| POST /api/conversations | Create/open a direct pair using participantId |
| GET /api/conversations/[id]/messages | Cursor/limit message page |
| POST /api/conversations/[id]/messages | Send content/clientId/optional replyToId |
| PATCH /api/conversations/[id]/messages/[messageId] | Author-only edit |
| DELETE /api/conversations/[id]/messages/[messageId] | Author-only soft deletion |
| POST /api/conversations/[id]/read | Mark explicit messageIds read as current user |

## Verification and limitations

Run `pnpm test` for unit tests. Set TEST_DATABASE_URL and TEST_DATABASE_SSL to a
dedicated PostgreSQL test instance to enable integration tests. Add TEST_AUTH_HTTP=1
for real Next.js forms and messaging API tests. Add CHROME_BIN pointing to an
installed Chrome/Chromium binary to include hydrated UI checks. The HTTP server
uses .next/auth-http-test and the browser uses an isolated temporary profile;
existing development servers and user browser profiles are preserved.
Run production builds and HTTP tests sequentially: production build cleanup
can remove the test server's nested output directory.

Tests cover pair-creation races, persistence, listing, membership, author-only
operations, retries, replies, soft-deletion redaction, exact cursor precision,
read receipts, unread counts and invalid input. HTTP tests exercise cross-account,
spoofed actor and cross-origin attempts, oversized requests and refreshed pages.
Browser checks exercise actual sending/editing, reload persistence, failed-send
draft retention/retry, older-page scroll behavior, deleting and mobile overflow.
Pagination tests also cover identical timestamps and their UUID tie-breaker.

Milestone 3 originally required manual refresh. [Milestone 4](realtime.md) adds
automatic two-second synchronization, typing and presence with PostgreSQL recovery.
Refresh now requests a fresh authoritative snapshot and recovers loaded history
using bounded page requests. Read-state changes update both browsers
automatically while their tabs are visible.
Calls remain unavailable. [Milestone 5](file-sharing.md) adds private Neon Object Storage
attachments to the thread. Broader multi-device browser testing and deployment remain open.
Authentication needs the production secret and reviewed migrations described in
authentication.md. Existing appearance lint and Turbopack environment limits are
reported independently; use the supported webpack build for local verification.

## Milestone verification — October 14, 2026

- All 52 tests passed with no skips, using PostgreSQL 16.15 in a temporary local
  cluster, HTTP tests enabled and isolated headless Chrome. This includes the
  existing database/authentication suites and the new messaging/browser checks.
- `pnpm exec tsc --noEmit`, lint for all milestone code and `git diff --check`
  passed. `pnpm exec next build --webpack` passed outside the restricted sandbox.
- `pnpm lint` still fails on the existing appearance-settings effect error.
  `pnpm build` still fails because sandbox restrictions prevent Turbopack's
  CSS worker from binding a port. The sandboxed webpack attempt also failed to
  parse TypeScript subprocess output; its unrestricted rerun passed.
- An initial browser timeout was fixed by coercing DOM conditions to booleans
  before returning them through Chrome DevTools. A test run interrupted during
  a concurrent production build passed when run sequentially.
- Only newly created test schemas were migrated and removed. The configured
  application database and environment files were untouched.
