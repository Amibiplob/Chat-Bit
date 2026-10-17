# Profile, settings and interface completion

Milestone 7 preserves ChatBit's existing session, PostgreSQL polling, private
attachment storage and WebRTC architecture. Review `db/migrations/006_settings.sql`
and apply it to an explicitly selected database before deployment. No migration
runs during builds; implementation/testing never migrates the application database.
The additive migration adds account preference columns, avatar versioning, a
bounded `profile_avatars` table, and partner revision invalidation after name/avatar
changes. Runtime roles need DML access to profile_avatars and the existing tables.
No new environment variables or storage bucket are required.

## Profile and avatar visibility

Settings displays the signed-in user's actual email, ID and join date. Users can
edit a trimmed display name (1–80 characters) and bio (0–160 characters). Bio and
email remain owner-only; usernames and email changes are unavailable. Names are
already discoverable through the existing user search. Name/avatar updates bump
conversation partners' revisions and appear through the existing polling loop.
Avatars appear in conversation lists, headers, messages, contacts and calling UI.
Current-account details synchronize on focus and every 30 seconds in visible tabs;
profile form drafts are not overwritten while users edit.

Avatar writes always use the verified actor; clients cannot select an owner.
Uploads stream through a 256 KiB byte cap and accept only PNG, JPEG or WebP raster
signatures. The explicit sharp dependency decodes at most 16 megapixels, rotates
using orientation, resizes to at most 256 × 256, discards animation and re-encodes
PNG without EXIF/GPS metadata. Corrupt images and oversized output fail closed.
SVG and arbitrary remote image URLs are rejected. One small database bytea per
account avoids orphaned Supabase objects and another bucket/scheduler lifecycle.
Removing/replacing an avatar is transactional; no old image object is retained.
This trades modest PostgreSQL storage/traffic for a bounded portfolio-scale design.
It is separate from the existing private attachment bucket.

GET `/api/avatars/[userId]` checks the session and permits only the owner or an
existing conversation member paired with that user. It streams a fixed image MIME
with private/no-store, nosniff and restrictive CSP headers. URLs contain only user
IDs and a version; they are not bearer download tokens. Initials remain available
when no avatar exists or an image fails. No avatar bytes or biography are included
in public search or call-signaling payloads. An authorized partner can save any
image they see; removing an avatar cannot revoke their downloaded copies.

## Preferences and notifications

Account preferences persist in PostgreSQL: background message notifications,
background incoming-call notifications, online visibility and last-seen visibility.
They synchronize across sessions on focus or within 30 seconds in a visible tab.
Forms save only after explicit submission and report errors/success. Only edited
preferences are submitted; atomic partial updates preserve unrelated settings from
other sessions. Untouched controls follow the latest account snapshot. No fake
mentions, sounds, read-receipt, typing, 2FA, language or blocked-user toggles remain.

Browser permission is device-specific and requested only from the Enable browser
notifications button. Account preference alone cannot grant permission. Notifications
require a supported browser, granted permission and an open ChatBit tab. Only
background tabs create system notifications. They contain generic text without
names, previews or message bodies. Clicking one focuses the window. Tags coalesce
notifications for a conversation/call; separate tabs may still race or notify more
than once across devices. There is no push subscription, service worker delivery,
notification sound or closed-app delivery. Some mobile browsers reject the
Notification constructor; in-app messages/call invitations continue to work.

The existing messaging/call loops may poll hidden tabs when the corresponding
notification preference and browser permission are enabled; otherwise idle hidden
polling remains paused. No duplicate message/call polling loop is created. Message
read acknowledgements and presence heartbeats still require visibility. Existing
active calls continue their own owner heartbeats. Browser throttling, network loss
and OS sleep can delay or prevent background notifications. Background polling
increases Vercel/database usage. Account-settings refresh is one additional bounded
30-second loop and never starts another realtime or WebRTC controller.

## Themes and accessibility

Light, dark and system themes use the device-local `chatbit-theme` key. Values are
validated; system responds to OS changes, and other tabs respond to storage events.
`useSyncExternalStore` provides a stable system server snapshot and browser snapshot,
fixing the previous effect/setState lint issue without suppressing it. A small static
head bootstrap applies the saved theme before paint. Only the root theme class uses
hydration-warning suppression because browser preferences are unavailable on the
server. A future strict CSP must authorize this fixed script by hash or nonce.
Storage failures are reported and system remains the default.

The original Inter and JetBrains Mono variable Latin WOFF2 subsets are bundled
locally using `next/font/local`, with their complete SIL OFL 1.1 notices in
`public/fonts`. The previous failure came from build-time Google network requests,
not the chosen typefaces. Builds no longer contact Google for fonts. Other scripts
use browser fallback fonts, as before. See `public/fonts/README.md` for provenance.

Mobile settings navigation now exposes every section in a horizontally scrollable
navigation bar. Mobile app links reach Chats, Calls, Contacts and Settings; contact
rows use genuine existing conversation partners. Settings/profile sidebar content
uses the actual account. Layouts allow scrolling and small-screen form widths.
Focus outlines, semantic form labels, live feedback, larger message action targets,
reduced-motion styling and route loading/error/retry states are included. No claim
of full WCAG conformance or a complete contrast/screen-reader audit is made.

## Passwords and sessions

POST `/api/settings/password` requires the current password and a different,
matching new password of 8–128 characters. Existing Argon2id settings are reused.
Password verification is rate-limited, then the user row is locked and the verified
hash/current session are rechecked before updating. Every session, including the
current one, is revoked atomically; the response clears its cookie and the UI
returns to login. Other tabs lose authorization on their next API request; active
calls are reconciled by the existing session-expiry mechanism. Login rechecks the
hash under the same user-row lock so an in-flight old-password login cannot issue
a session after password revocation.

The session list shows at most 50 actual unexpired session creation/expiry records
and marks the current one. It never exposes token hashes, IP addresses or invented
device names. Signing out other sessions requires the current password, preserves
the current session and revokes only the owner's other sessions. Existing logout
remains functional. Recovery, MFA and individual remote-session selection are
unavailable.

All settings mutations use same-origin checks, strict server schemas, parameterized
SQL, authenticated actor selection and the existing bounded JSON reader. Avatar
uploads have a separate streaming cap. Shared PostgreSQL rate limits allow five
sensitive requests, ten avatar mutations and 120 general/avatar-read requests per
user/minute. Counters use AUTH_RATE_LIMIT_SECRET and commit even on rejection.
Unexpected failures return safe messages and do not expose SQL or credentials.

## Account deletion lifecycle — unavailable

There is deliberately no destructive endpoint or confirmation flow. The original
schema holds shared conversations, sender/reply links, receipts, call history and
private storage metadata with foreign keys. Removing only a users row or casually
cascading shared records could destroy partners' history, strand files, or leave
valid storage URLs. No production cleanup was run.

A future implementation must agree a retention/export policy, reauthenticate and
explicitly confirm, atomically disable login and revoke sessions/call ownership,
then queue idempotent cleanup with durable tombstones and retries. It must define
anonymization versus deletion for messages, replies, memberships and shared call
history, revoke attachment visibility, wait out already-issued signed URLs, remove
Supabase objects with retryable verification, remove the avatar, and only then
finalize personal-record erasure without violating foreign keys. Backups/logs,
legal retention and partners' saved copies need a documented policy. Until that
workflow exists, the UI clearly says account deletion is unavailable.

## Verification

Run tests only against a dedicated instance; each suite creates/drops its own
random test schema:

```bash
TEST_DATABASE_URL=postgresql://chatbit@127.0.0.1:55437/postgres TEST_DATABASE_SSL=disable TEST_AUTH_HTTP=1 CHROME_BIN=/usr/bin/google-chrome pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm exec next build --webpack
git diff --check
```

Database tests cover profile isolation/revision updates, avatar authorization,
persistence, privacy enforcement, reauthentication and password/session revocation.
Unit tests cover strict input schemas, corrupt/oversized avatar rejection and
metadata removal, theme resolution and notification permission/visibility rules.
The HTTP/Chrome suite covers protected settings, cross-origin/actor rejection,
real profile save feedback, theme persistence/system changes, responsive navigation
at 320/390/768/1280 pixels and basic keyboard/label checks. These checks are not a
full assistive-technology audit. Existing Supabase tests use a fake provider;
live storage, physical media devices, remote networks and TURN relay connectivity
still require deployment tests.

### Available-environment results (2026-10-16)

These are the historical Milestone 7 results. See the
[Milestone 8 readiness audit](production-readiness.md) for subsequent isolated
PostgreSQL and browser verification and remaining deployment blockers.

- `pnpm test` succeeds. The sandbox's isolated Node test workers report only
  file-level results, so `node --test --test-isolation=none tests/*.test.mjs` was
  also run: **47 passed, 8 skipped, 0 failed**.
- Skipped suites: database migrations, authentication, HTTP/browser authentication
  and UI, messaging, realtime, attachments, calling, and settings integration.
  `TEST_DATABASE_URL` is not configured. Only PostgreSQL client programs are
  installed (`postgres`, `initdb`, and `pg_ctl` are absent), so no dedicated local
  instance could be started. The HTTP/browser suite additionally needs
  `TEST_AUTH_HTTP=1`; Chrome alone cannot exercise protected settings without it.
  Responsive and authenticated browser assertions are authored, not verified here.
- `pnpm exec tsc --noEmit`, `pnpm lint`, and `git diff --check` pass.
- `pnpm build` (Turbopack) stalled at compilation and was interrupted. The first
  sandboxed Webpack attempt failed reading TypeScript subprocess `--showConfig`
  output, while a direct TypeScript invocation returned valid JSON. Webpack
  outside the sandbox completed compilation, type checking, page generation and
  build traces successfully. No Google Fonts fetch is required by either build.
- The application database was neither migrated nor used for tests. No live
  Supabase, physical-device calling, cross-network WebRTC, full keyboard/contrast
  audit, or complete WCAG audit was performed.
