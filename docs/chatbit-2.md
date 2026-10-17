# ChatBit 2 implementation and verification

## Architecture and boundaries

One server-rendered Next.js application remains the web and Android frontend.
Existing Argon2id accounts, PostgreSQL sessions, polling, private signed/direct
uploads and WebRTC remain authoritative. Migrations 001–008 are immutable and
no production migration, permission change, storage deletion or credential change
is part of this work. The protected legacy conversation-list edit is excluded.

Work is divided into six commits: policy/audit, design/shell, messaging/navigation,
rich media, PWA/Android, and release automation/hardening. Validate each with unit
tests, TypeScript, ESLint, Webpack build, whitespace/index review and available
browser checks. Database suites require disposable fixtures; never use .env's
production URL for tests.

## Milestone 1

New signup and password-change policy is now 8–128 characters, shared by browser
and server. Existing hashes, login acceptance, Argon2id cost, sessions, TLS and
rate limits are unchanged. Explicit 7/8/128/129-character boundaries are tested.

Audit findings: polling waits two seconds *after* each request, making healthy
cadence request-duration plus two seconds. The sender waits for a full snapshot
before its composer clears. There is no production latency trace available, so
neither observation proves the reported live 5–20 second delay. Instrument and
measure before claiming a production latency fix. Current auth availability
requires the Vercel evidence described in authentication.md.

Attachment uploads already go directly to signed private Storage URLs. Completion
buffers/verifies at most 10 MiB, with a 100 MiB user quota; raising the cap would
require redesigning verification, quota/capacity and abuse controls. Do not raise
it for this redesign. Multiple attachment reservations can be processed serially
as separate messages; no atomic multi-file message is supported.

No Android SDK, Java, Gradle, adb or Bubblewrap executable was found locally.
Android source/configuration and CI can be prepared, but no APK or real-device
success can be claimed without those tools, a stable HTTPS origin and signing.

## Milestone 2

Teal ChatBit identity, soft paper/night surfaces, shared panel/action typography,
new landing composition, honest feature content (no inert demo buttons), refreshed
auth surfaces and live controls. Public Help/FAQ and About routes describe actual
capabilities and limits; a root not-found route provides recovery. Navigation
anchors now work from auth/help routes. Existing settings, calls, profile and
navigation components adopt the same visual vocabulary without replacing data.
