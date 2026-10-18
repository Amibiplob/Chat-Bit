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

The supplied origin is https://chat-bit-rouge.vercel.app. A read-only browser-tool
request was unavailable; no live login, private message or provider test has been
performed. Never infer production auth/latency/TURN success from local checks.

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
