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

## Milestone 3

Optimistic text sends display a clearly labelled Sending bubble immediately,
replace its ID only after the server confirms the idempotent POST, and reconcile
with authoritative snapshots. Failed sends keep the draft and reuse client IDs on
retry. Snapshot refresh no longer holds the composer pending after POST success.
Polling keeps the two-second target start cadence, subtracts request duration and
retains one in-flight request, a 500 ms minimum rest and existing retry backoff.
This removes measured-by-design additive waiting; it is not a measured production
1–3 second delivery guarantee.

Message search and media/file/saved filters explicitly cover loaded history only.
Saved markers store at most 500 IDs per user/conversation in this browser, never
message contents; they do not sync across devices. Older-history loading remains
available. Reading older messages no longer forcibly jumps on every arrival.

Successful messaging APIs expose numeric Server-Timing: app (whole operation),
pool (transaction acquisition) and db (transaction time including BEGIN/COMMIT).
These are partial transaction metrics, not all SQL time or browser/network time.
Use DevTools Network POST and sync durations plus Server-Timing and React Profiler
on an authorized deployment to measure the reported latency. Pool budget is per
instance; provider wait/capacity and hidden-tab suspension still affect delivery.
No production benchmark, database index or polling-frequency increase is claimed.

## Milestone 4

The composer offers photos/videos, documents or the safe allowlist, with up to four
files queued as separate messages. Local bounded image/video previews revoke Blob
URLs on cleanup. Each file has progress; successful files leave the queue, failures
and cancellations retain unsent files for retry. The first file receives the
caption; retries after partial success do not repeat that caption.

Private chat attachments share a reusable preview/download card, inline playable
video, retry feedback and a full-screen native dialog with Escape/focus and Android
back handling. Verified content responses support single HTTP byte ranges for
seeking, with invalid ranges returning 416. Verification/auth still precede any
bytes. Shared files is a real membership-scoped, keyset-paginated gallery, with
media/document filters and conversation links. No new tables or migrations.

Large-video boundary: signed direct upload already avoids Vercel's incoming body
limit. Supabase recommends TUS above 6 MB and supports signed upload tokens via
x-signature, but resumability alone does not solve this app's whole-object
verification/memory/quota budget or reservation expiry. Keep 10 MiB and 100 MiB
limits. A future reviewed TUS implementation must retain scoped path ownership,
non-upsert, quota reservations, restart/expiry handling and content checks before
publication; larger caps need bounded streaming verification and capacity tests.
No arbitrary-size video, transcoding, larger bucket or paid service is enabled.
Sources: https://supabase.com/docs/guides/storage/uploads/resumable-uploads and
https://supabase.com/docs/guides/storage/uploads/file-limits (reviewed 2026-10-18).

## Milestone 5

Web manifest, generated ChatBit launcher/maskable icons, viewport/safe areas and
a public-only offline fallback are installed. No API, media, auth or chat response
is cached by the worker. Chats still require a connection; no offline outbox.
Android browser file selection and existing HTTPS media permissions remain native
to the browser; no duplicate backend or static Next export.

The Android package ID is com.chatbit.messenger. Its Bubblewrap manifest is
generated from an explicitly supplied stable production origin and public release
certificate fingerprints. Invalid/missing configuration fails closed. Digital
Asset Links returns 404 until configured on the correct origin. Signing material
and generated Android/APK/AAB output are ignored. APK/real-device verification
remains blocked by the missing SDK/JDK, stable origin and release key; never
publish a package with guessed origin or an unrelated/debug certificate.

Local verification: production Webpack build, TypeScript, ESLint and isolated
Bubblewrap generation using fixture icons passed. The available suite passed
69 tests with 10 database/HTTP integration skips before PWA-specific tests were
added; worker behavior and Android configuration tests also pass. No PostgreSQL
server binaries, Java or Android SDK are installed here. Source generation does
not establish Gradle compilation, signing, site verification or device behavior.

## Milestone 6

Manual-only Android CI prepares APK/AAB artifacts after web validation, isolated
generator checks, certificate matching and deployed Digital Asset Links checks.
Build and release repository opt-ins default to disabled. Publication additionally
requires an explicit input and matching version tag. Signing secrets never enter
arguments or artifact paths; only publication can write Releases. Direct Gradle
and native signing avoid Bubblewrap's first-run interactive prompts. See
android/README.md for variables, secrets and exact device/setup boundaries.

Local Chrome checked six public routes at 360, 412 and 1280 pixels (18 checks),
without horizontal overflow, plus production worker registration. Manifest,
worker cache headers and unconfigured DAL 404 were checked over local HTTP.
Authenticated two-user browser, live database, provider media, production latency,
TURN and real Android checks remain unperformed in this run. APK/AAB output and
GitHub workflow execution remain blocked by external setup/tools above.

Final local suite: 82 tests, 72 passed, 10 skipped, zero failures. TypeScript,
ESLint, production Webpack build, Android fixture generation, YAML parse/release
gate checks and Git whitespace checks passed. Signing orchestration used fake
tools and fixture outputs; it is not evidence of a real APK/AAB build.
