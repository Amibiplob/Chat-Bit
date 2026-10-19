# ChatBit 3 audit and verification

## Architecture and priorities

One Next.js App Router application serves desktop, mobile and installed browsers.
Existing routes cover chats, contacts, calls, shared files, settings, login/signup,
help/about and recovery states; settings already contains profile/security/privacy.
No duplicate pages, database changes or production migrations are needed.

1. Retire APK-only packaging, signing/DAL route and workflows. Preserve manifest,
   launcher icons, offline worker, web CI and encrypted database backup workflow.
2. Improve the shared design system, mobile shell and public/auth presentation.
3. Fix verified conversation layout/reliability issues and improve touch controls.
4. Add browser installation, regression checks and a two-device test plan.

The protected conversation-list edit is excluded from every milestone. Legacy
ignored Android build/cache/key files remain untouched and ignored so `git add .`
cannot accidentally restore them. No Android dependency remains in tracked source.
The web dependencies never included Bubblewrap; its separate lockfile is removed.
The legacy mock-data module is retained because the protected, unused
conversation-list file imports it. Active routes use PersistentConversationList
and backend data; removing the module would break that unrelated user's file.

## Audit findings and boundaries

- Authentication uses shared 8–128 new-password validation, Argon2id, sessions,
  rate limits and verified database TLS. No account/hash changes are needed.
  Production auth availability cannot be established without a successful real
  login and deployment logs; frontend/build success does not prove it resolved.
- Messages already use idempotent optimistic sends and serialized two-second
  synchronization. Focus/visibility/online events request a fresh snapshot. Keep
  that cadence; no production latency benchmark is available. Server-Timing
  exposes partial app/pool/transaction timings for authorized manual measurement.
- Private attachments already validate on the server, enforce 10 MiB/file and
  100 MiB/user, authorize downloads and offer previews/progress/cancel/retry.
  No larger limits, storage changes or unsafe offline media caching are needed.
- Calls use browser permissions and explicit track cleanup. STUN/TURN and device
  network behavior remain external verification requirements. No native closed-app
  incoming calls or Web Push delivery is implemented.
- Fixed mobile bottom navigation overlaps the independent full-height shell;
  settings adds another viewport minimum. Move navigation into the shell flow.
- The existing worker caches only the public offline route. Preserve that rule.
  There is no install control yet; expose browser prompting only when supported.

Preserved workflows: `.github/workflows/verify.yml` (security/migrations/tests/web
build) and `.github/workflows/backup-database.yml` (encrypted backup). Removed
only `.github/workflows/android-debug.yml` and `android-release.yml`.

## Production boundary

The supplied origin is https://chat-bit-rouge.vercel.app. Read-only requests to
`/login` and `/manifest.webmanifest` returned HTTP 200. This verifies public
availability only; no live login, private message or provider test was performed.
Never infer production auth/latency/TURN success from public or local checks.

## Installation and final reliability milestone

Landing/Appearance installation controls capture browser install events at the
root, consume them once on an explicit tap and suppress repeat prompts for seven
days after dismissal. Manual instructions remain on unsupported browsers; blocked
local storage does not break the app. No push/background-call claim is added.

Confirmed error-reporting issue: an HTML/non-JSON gateway error previously became
a JSON parser exception. The transport now returns a useful error without exposing
the body and preserves HTTP status, including 401 for session recovery. Tests
cover HTML failures, invalid success bodies and server validation errors.

Confirmed offline weakness: caching the Next-rendered recovery page required
uncached JavaScript/CSS for its full presentation. The worker now caches only a
self-contained public document, without credentials or private response caching.
Cache versioning removes the previous public fallback on activation. Unit tests
cover private-request exclusion; the browser smoke script exercises offline
navigation and checks the cache contains only this document.

Browser smoke runs in web CI after the production build. Installation events are
simulated and isolated from Chrome's real eligibility event, so they do not prove
native installation or real Android OS behavior. Two-device live steps are in
[the manual test plan](manual-test-plan.md).

The full isolated run also exposed test-harness defects: gallery fixtures left
delete-pending quota reservations behind, and repeated CDP evaluations declared
the same global variable. The gallery test now completes cleanup for its own
aged, metadata-only fixtures; evaluations scope their variables. Production quota
rules are unchanged. Security verification still requires PostgreSQL 17 and is
not weakened to accept a different version. Temporary database binaries/data are
outside the repository; no system service or hosted database is changed.

The public recovery document is checked under offline emulation for both the
page and the service worker's separate CDP session. Page-only emulation can leave
the worker's network fetch online and cannot establish offline behavior.

## Responsive design milestone

Shared paper/teal surfaces, dark cards, larger form controls and restrained
typography apply to public/auth screens and the functional account sections.
The app shell uses a dynamic-height flex column on phones, a desktop rail and
four icon/label bottom destinations. Navigation occupies layout space and hides
for individual conversations and live calls. Shared files remains accessible
from Chats and the desktop rail. Settings uses its parent's available height.
Conversation previews/unread badges/search remain real data; no unsupported
pinning or online indicator was invented for the list.

Local checks: 69 tests passed, 10 database/HTTP tests skipped; TypeScript, ESLint
and production build passed. Isolated Chrome checked seven public routes at
320/390/430/768/1280 pixels (35 combinations), frontend signup validation and
uncaught errors/hydration console errors. These signed-out checks do not establish
authenticated navigation or Android keyboard/device behavior.

## Mobile conversation milestone

Search/filter controls collapse to preserve message space. The composer grows
with text, exposes emoji on phones and offers camera capture as a browser hint
(gallery fallback; backend validation stays authoritative). Queue limits,
previews, progress, cancellation and private downloads remain unchanged.
Stationary touch/pen long press opens message actions; movement/release cancels
it and Shift+F10/the visible actions button provide alternatives. Mobile menus
are in flow with 44px rows rather than clipped above the scroll container.

Confirmed scroll issue: a media preview loading after the last message render
changes the content height without a new message. The prior message-only effect
could leave a reader who was at the bottom behind. A content ResizeObserver
keeps the bottom pinned only when already following; it disconnects on unmount.
Keyboard height uses supported dynamic viewport CSS and the existing viewport
resize hint; real Android keyboards still require device tests.

Explicit `pageshow` recovery now forces a fresh snapshot after browser history/
back-forward cache restoration. Regression tests cover resumed missed messages,
stationary long press and cancellation. Existing ordering/idempotency/read-receipt
tests remain. No faster polling, provider change or live delivery claim is made.

## Final verification

The default `pnpm test` run passed 75 tests and skipped 10 database/HTTP suites.
With disposable PostgreSQL 17, the separated unit/database/security run passed
147 tests with zero failures; its one skip was the HTTP/browser suite reserved
for a separate run. No hosted database or private Storage was used.

TypeScript, ESLint, production Webpack build, Git whitespace and staged-content
checks passed. The production Chrome smoke test passed 35 public route/viewport
combinations at 320/390/430/768/1280 pixels, signup validation, theme changes,
simulated install/dismissal, cache isolation and offline page/worker navigation.
A signed-out phone screenshot was inspected locally. This is not real Android
hardware, OS installation, provider media, production login, TURN or live latency
verification. Earlier combined HTTP runs timed out; no test deadline or security
assertion was relaxed. Final HTTP results are recorded separately below.

The standalone HTTP/Chrome run passed all 16 tests with zero failures, skips or
cancellations. It verified real local registration/login/logout, session cookies,
protected routes, cross-origin rejection, profile/preferences, calling controls,
native WebRTC audio/video with synthetic devices, messaging drafts/edits/mobile
controls, and two browsers discovering contacts, exchanging/replying/reading/
deleting persisted messages and logging out. Together the separated runs passed
147 unit/database/security checks plus 16 HTTP/browser checks. The default run's
database skips were exercised through these isolated runs; no production provider
or hardware outcome is implied.
