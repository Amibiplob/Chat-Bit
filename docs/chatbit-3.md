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
