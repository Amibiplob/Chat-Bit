# Automatic messaging, presence and typing

## Architecture decision

Milestone 4 uses authenticated short HTTP polling, with PostgreSQL revision
counters and authoritative snapshots. A visible browser tab synchronizes every
two seconds; hidden tabs stop polling and catch up immediately on return.
This is near-real-time delivery (normally up to two seconds plus request time),
not WebSocket push. It needs no additional account, provider key or dependency.
Next.js Route Handlers finish each request, so no persistent process or connection
inside a Vercel Function is required. PostgreSQL remains the source of truth.

Options evaluated on October 14, 2026:

- [Ably Free](https://ably.com/docs/platform/pricing/free) offers 200 concurrent
  connections, 200 concurrent channels, 500 messages/second and six million
  messages/month. It is suitable for managed push, but requires account/key setup,
  scoped expiring tokens and a separate publication/recovery path. It remains an
  option when measured usage warrants faster delivery or reduced HTTP traffic.
- A separate WebSocket server needs another deployment and operational lifecycle.
  This milestone does not provision one or depend on free hosting remaining awake.
- Short HTTP polling uses the existing authenticated data-access boundary and
  avoids an external delivery failure mode. It trades instant push and transport
  efficiency for fewer moving parts, complete local testing and simple recovery.

[Vercel Functions](https://vercel.com/docs/functions) handle individual requests.
Polling consumes function invocations, database queries and transfer. A visible
tab makes about 1,800 sync requests/hour plus activity heartbeats. The
[Hobby plan](https://vercel.com/docs/plans/hobby) has bounded free usage, is meant
for personal projects, and can suspend exhausted features; confirm the current
dashboard allowance before deployment. This design is for a small portfolio
application, not a claim of free, unlimited or high-scale chat hosting. Keep the
existing bounded PostgreSQL pool; monitor request volume and database load.

## Security and recovery contract

Every sync/activity request resolves the current ChatBit session. Membership is
checked for the selected conversation, list rows and presence reads. There is no
browser-supplied actor or reusable realtime access token. Logout/expiry takes
effect on the next request. Mutations retain same-origin checks and bounded JSON.

An additive migration introduces per-user revision counters and short-lived
activity leases. Database triggers update revisions in the same transaction as
conversation/message/read-state changes. Revisions serialize updates per user;
they are not a global sequence cursor that can skip a late-committing transaction.
Sync returns a coherent database snapshot only after committed changes are
visible. Lost responses can be retried without acknowledging or deleting events.
No pub/sub event or in-memory emitter is treated as durable persistence.

Snapshots replace by message ID in chronological order, include edits/deletions/
replies/receipts and retain a bounded loaded-history window. Polls never overlap;
obsolete responses cannot overwrite a newer conversation. Reconnection always
requests an authoritative snapshot. Errors show a reconnecting state and back off.

Activity leases are bound to a verified session and random tab ID. Visible tabs
heartbeat; leaving/hidden tabs clear their own lease. Multiple tabs remain online
until the last lease expires or leaves. Presence is only exposed to existing
conversation partners. Online means a recent visible ChatBit tab, not proof that
someone is reading the thread. Typing uses a throttled transient lease, expires
without a stop event and never stores keystrokes or an event history. Server
limits bound client-originated activity requests across all instances.

## Configuration

Use the existing DATABASE_URL, DATABASE_SSL / DATABASE_SSL_CA, DATABASE_POOL_MAX
and production AUTH_RATE_LIMIT_SECRET. There are no new external-provider keys
or browser-exposed secrets. Review migration 003 and run `pnpm db:migrate` against
the intended database before enabling the new application build. Do not run
migrations during builds. The application database is not migrated by this work.

Local development remains `pnpm dev` after reviewed migrations. Vercel deploys
the same Next.js app and authenticated HTTP routes, with a provider-supported
PostgreSQL endpoint and verified TLS. No cron service is required for delivery;
activity expiration is computed at read time, even if no cleanup worker runs.

## Implementation details and operating limits

- GET `/api/realtime/sync?state=...` takes a validated conversation ID, revision,
  oldest loaded-message cursor and optional force flag. An unchanged revision
  returns no message/list body, but still checks the selected membership and
  returns current authorized presence. Changed revisions return the list and
  selected message window in one repeatable-read transaction. Initial/reconnect
  requests force a snapshot. No transport event acknowledgement can erase data.
- POST `/api/realtime/activity` takes tabId, monotonic sequence, conversationId,
  typing and optional leaving. The actor and session hash come from verified
  server cookies. Session/user matching, membership, origin and body validation
  run before a lease changes. A session-row lock enforces the tab bound atomically.
- Normal synchronization starts every two seconds after the preceding request
  finishes; latency includes database/network time. Failures back off to 30
  seconds. Returning online or focusing a visible tab forces immediate catch-up.
  One request runs at a time; mutation-triggered requests supersede earlier
  snapshots. Unmount aborts requests and clears timers/listeners. A 401 stops
  the loop and returns the browser to login. Cached UI is not a new access grant.
- A fresh thread starts with 50 messages. Synchronization retains messages from
  the oldest loaded cursor through the newest row, with 1,000 rows per sync
  response. If that bound is exceeded, the client retrieves additional authorized
  100-row pages through the oldest explicitly loaded row before updating the UI.
  Pagination beyond 1,000 rows therefore remains usable. These extra pages can
  observe later commits; the next revision check reconciles concurrent changes.
  Very large loaded histories cost more requests/memory and may exceed the
  15-second synchronization deadline; reload to return to the newest page.
  Older messages remain in PostgreSQL. This includes
  edits, deleted placeholders, current reply quotes and actual read receipts.
- Visible tabs heartbeat every ten seconds, with a 25-second online lease.
  Typing updates are throttled to once per three seconds, stop on blur/send/
  inactivity, and expire after six seconds. PostgreSQL stores the current lease,
  not each keystroke, typing event history or transient pub/sub log. Delayed
  requests are fenced by a monotonic sequence per tab. Departed leases retain
  their sequence for at least a minute before a new tab can reclaim a slot.
- Up to ten recent tab IDs are retained per session; old expired slots are reused.
  Logout deletes its leases via the session foreign key; session expiry is checked
  by presence reads even before cleanup. Other valid tabs/sessions keep the user
  online. Last seen is recent visible-tab activity; it is shared only with existing
  conversation partners and may disappear on logout. It is not a read receipt.
- Shared database limits allow 240 sync and 90 activity requests per user/minute,
  across all sessions and instances. Excess requests return 429 and retry with
  backoff. Many visible tabs consume these shared budgets. The existing auth-rate
  limit cleanup command also removes expired realtime counters. Activity rows
  are bounded by the ten-slot limit and cascade away with session deletion.

## Verification

Run the existing test command against a dedicated PostgreSQL instance:

```bash
TEST_DATABASE_URL=postgresql://chatbit:local-password@127.0.0.1:5432/chatbit_test TEST_DATABASE_SSL=disable TEST_AUTH_HTTP=1 CHROME_BIN=/usr/bin/google-chrome pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm exec next build --webpack
git diff --check
```

Tests migrate only random schemas in the dedicated test database and remove them
afterward. Run builds and HTTP tests sequentially because build cleanup can remove
the nested test output. Browser checks use a temporary Chrome profile. Unit tests
mock dropped responses, duplicate snapshots, in-flight mutations, reconnects,
visibility and unmount cleanup. PostgreSQL tests cover membership isolation,
transactional revisions, rollback, delivery failure recovery, loaded history,
typing/presence expiration, multiple tabs, sequence fencing, session revocation,
rate limits and input validation. HTTP/browser tests exercise authenticated routes
and actual automatic delivery/edit/delete/read/list updates, typing and reconnects.

There is no external pub/sub publication in the selected transport. Its analogous
failure is a lost HTTP response after a committed write; recovery tests discard
that response and synchronize again from the prior revision. No provider account
or production deployment was provisioned or live-tested. Free-plan capacity,
large-user-count load, background/mobile scheduling and production latency need
deployment measurements. Browsers can delay timers; offline/typing cleanup is
lease-based, so disappearance is bounded rather than instantaneous after crashes.
[Milestone 5](file-sharing.md) adds attachment revisions to this same polling
transport. [Milestone 6](calling.md) adds separately scoped, authenticated
PostgreSQL call-signaling polling.

## Milestone verification — October 14, 2026

All 69 existing/new tests passed with no skips using a temporary PostgreSQL 16.15
cluster, authenticated Next.js HTTP routes and isolated headless Chrome. Browser
checks confirmed automatic delivery, edits/deletions, receipts, typing, reconnect
recovery, new-conversation previews and unread badges without reloading the page,
alongside the existing draft, pagination and mobile checks. Unit/integration
checks also verified recovery of a 1,071-message loaded window using bounded pages.

`pnpm exec tsc --noEmit`, targeted lint for all milestone code, the Webpack
production build and `git diff --check` passed. `pnpm lint` still fails only on
the existing appearance-settings effect error. `pnpm build` still hits the known
Turbopack sandbox port-binding restriction; `pnpm exec next build --webpack`
passed outside that sandbox. No external provider was used or live-tested.
Only isolated test schemas were migrated; application data and environment files
were untouched. The unrelated conversation-list edit and invalid Codex checkpoint
reference were preserved.
