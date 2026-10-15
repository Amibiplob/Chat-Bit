# Secure file sharing

Milestone 5 retains ChatBit's PostgreSQL database, Argon2id login, hashed sessions
and two-second revision polling. Supabase is used exclusively as private object
storage. This work does not provision resources, change environment files, migrate
the application database, or verify uploads against a real Supabase account.

## Setup and deployment

1. Create or select a Supabase project. In Storage create **chatbit-attachments**
   with **Public disabled** and **file size limit 10485760 bytes (10 MiB)**.
   Set allowed MIME types to the list in `attachment-validation.mjs` as an extra
   provider safeguard. No anonymous/authenticated storage policies are needed;
   do not grant public listing, writes or reads. Never make the bucket public.
2. Configure these server-only values locally and in Vercel, using real values
   in your private configuration only:

   ```text
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your-server-secret-key
   SUPABASE_STORAGE_BUCKET=chatbit-attachments
   ATTACHMENT_CLEANUP_SECRET=replace-with-at-least-32-random-characters
   ```

   Use the project's server secret key (or legacy service-role key). Never use a
   NEXT_PUBLIC prefix. The SDK is imported only behind `server-only`; no Supabase
   authentication, database queries or Realtime are introduced.
3. Review `db/migrations/004_file_sharing.sql`, back up your target, then explicitly
   run `pnpm db:migrate`. Earlier migrations must be applied first. Migration 004
   extends the existing metadata table, MIME allowlist, nullable pending message
   association, lifecycle constraints/indexes and revision trigger; existing
   attachment rows retain availability. It stores no file bytes. Never migrate
   during a build. This work has not migrated any application database.
4. Install the frozen lockfile, build, deploy, and arrange an external scheduler
   to POST `/api/attachments/cleanup` every five minutes with
   `Authorization: Bearer <ATTACHMENT_CLEANUP_SECRET>`. Configure this deliberately:
   no scheduler is provisioned by the application. Each run handles at most 20
   objects; increase scheduler frequency if monitoring shows a backlog. Reservations
   also perform one awaited cleanup batch as a fallback. Without traffic or a
   scheduler, physical cleanup waits until a later invocation.
5. Smoke-test two accounts on the deployed site: upload every supported type,
   cancel, refresh, recipient delivery, download, author deletion and outsider
   denial. Configure your project's storage CORS for the deployed origin if needed.
   Direct uploads avoid Vercel's request-body limits; only small JSON reaches
   upload routes. Preview responses pass through Vercel, consuming function and
   transfer budgets. Deploy with runtime limits sufficient for 10 MiB verification.

The storage adapter checks the bucket is private and has a positive limit no
larger than 10 MiB before signing uploads/downloads or reading objects. Operators
must keep these settings private throughout the object's life; changing a bucket
public would bypass application authorization.

## Upload architecture and quotas

The composer selects one supported image, video, audio or document, optionally
with a caption. It displays transfer progress, cancellation and errors. Supported
extensions: jpg/jpeg/png/webp/gif/pdf/txt/doc/docx/xls/xlsx/ppt/pptx/mp3/wav/mp4/webm.
Attachments during edit/reply are disabled; send a separate attachment message.

Every reservation resolves the current ChatBit session, enforces same-origin
mutation requests, validates strict bounded JSON and conversation membership,
then takes a per-uploader transaction advisory lock. A random UUID object key is
generated on the server, unrelated to the original filename. Browser paths and
actor IDs are never accepted. Pending metadata expires after 15 minutes.

The application enforces 10 MiB per file and 100 MiB per uploader (shown as MB
in the UI). The quota lock serializes concurrent reservations across instances.
Available files charge their exact validated size. Every unfinished, failed or
pending-deletion file conservatively reserves **10 MiB**, because signed upload
tokens cannot enforce a particular declared size. This can temporarily reject an
upload even when retained files total less than 100 MiB. At most ten such slots
fit in an otherwise empty quota. Physical removal and token-expiry reconciliation
release the slot. These are application rules, not Supabase's automatic user quota.
The independently required bucket size limit bounds direct upload abuse.

The server issues a path-scoped signed upload token with overwrite disabled.
The browser PUTs bytes directly to Supabase with XMLHttpRequest for progress,
then requests completion. Cancellation aborts transport and requests deletion;
network loss is recovered by reservation expiry. The server downloads the
private object, checks actual length and content signatures, then atomically
creates the persistent message and marks the metadata available. Database
transactions never wait for external object-storage requests. Failed validation
or persistence marks only a still-pending reservation failed. A concurrent
successful completion is never removed by another completion's failure.
Completion is idempotent for a reservation and persistent message ID. Separate
user retries after an ambiguous final response can create a second message;
refresh the thread before retrying an uncertain send.

Content validation checks image/media headers, UTF-8 plain text, PDF/legacy Office
signatures, and Office ZIP central-directory document entries. Office ZIP macros
and traversal entry names are rejected. These checks are not antivirus, a full
media decoder, or proof that Office/PDF files contain no active content. Legacy
Office formats share a container signature and cannot be distinguished fully.
Executables, HTML and SVG are outside the allowlist; executable headers/shebangs
are rejected as plain text. Documents always download as attachments. Consider
malware scanning before a wider public launch.

Message insertion and attachment availability update the existing transactional
revision counters. Polling returns attachment DTOs without storage keys/tokens,
merges by message ID, preserves ordering and updates previews/unread counts.
Default attachment-only text is `Attachment: <filename>`. Deleted-message DTOs
contain no attachment metadata.

## Downloads and retention

GET `/api/attachments/[id]/download` authenticates the current session and checks
current conversation membership, available metadata and live parent message.
For media previews it returns an authenticated `/content` URL. That handler
rechecks all authorization, validates bytes and sends the recorded content type,
`nosniff`, a restrictive CSP and `private, no-store`. It verifies a buffer up to 10 MiB and streams the response in 64 KiB chunks
([Vercel recommends streaming larger responses](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)).
Byte-range requests are not implemented, so seeking behavior depends on the
browser. Loading and preview failures are visible in the bubble.

Explicit downloads (`?download=1`) and documents receive a fresh **60-second**
Supabase signed URL with forced download disposition. Stored credentials never
reach the browser. The filename cannot contain separators, newlines or NUL.
UUID lookups join the authorized conversation and the live parent message, so
knowledge of another attachment ID is insufficient for access.

Files have no application time-to-live: they remain available months later if
retained by the provider, still within policy, and the requester remains
an authorized participant. There is no automated account-retention policy in
this milestone. Quota exhaustion rejects new reservations; it never deletes old
files automatically. Preserve both PostgreSQL metadata and storage backups.

Uploader-only deletion immediately marks metadata unavailable and schedules
physical removal. Message soft deletion does the same for its attachments in the
same transaction. Storage outages leave durable retry records, with exponential
backoff capped at one hour. Cleanup removes only explicit database-recorded
object paths; it never enumerates or deletes unrelated bucket objects.

[Signed upload tokens last two hours](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl),
longer than the application's 15-minute reservation. Tombstones retain quota
and retry removals every five minutes until three hours after reservation
creation, covering token lifetime and a bounded in-flight upload grace period.
Then a successful removal marks the record deleted and releases quota. Deleted
metadata remains as an audit tombstone. Extremely delayed provider writes beyond
this grace period require operator reconciliation; monitor bucket usage against
metadata rather than assuming perfect instantaneous cleanup.

[Already-issued signed download URLs remain usable until expiry](https://supabase.com/docs/guides/storage/serving/downloads),
even after membership/session revocation. Physical deletion may make them fail
earlier, but cached/downloaded bytes cannot be recalled. Future authorization is
revoked immediately by metadata or message deletion; never claim immediate
revocation of an earlier link or an already loaded preview.

## Provider limits

As checked October 15, 2026, the Free plan includes
[1 GB object storage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
and [5 GB each cached/uncached egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
These are project/organization allowances, separate from ChatBit's per-user limit.
[Low-activity Free projects can pause after seven days](https://supabase.com/docs/guides/platform/free-project-pausing).
Long-term availability therefore depends on an active project, provider policy,
backups and sufficient quota; free hosting is not a durability guarantee.
Monitor storage, transfer, verification reads and preview proxy traffic. Confirm
current dashboard allowances before deployment.

## Verification

```bash
pnpm test
node --test --test-isolation=none tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm exec next build --webpack
git diff --check
```

The explicit no-isolation test command exposes individual test bodies when this
sandbox suppresses subprocess test output. Unit tests mock Supabase bucket checks,
signing, object reads, removal and failures; workflow tests cover byte rejection,
persistence failures, idempotent completion, denied completion and bounded retry.
Set TEST_DATABASE_URL and TEST_DATABASE_SSL to a dedicated test instance for
attachment quota races, membership isolation, expiry, deletion and realtime
visibility tests. They migrate only random temporary schemas and remove only
those schemas. Never use the application database for tests. Existing Milestone 4
HTTP/browser suites additionally require TEST_AUTH_HTTP=1 and CHROME_BIN.
Run HTTP tests and production builds sequentially.

No live Supabase upload/download was verified. Database/browser bodies require
an isolated PostgreSQL server; installed PostgreSQL client programs alone do not
provide one. Deployment, real-provider CORS, media codecs and mobile playback
remain smoke-test requirements.

### Results in this workspace

- `pnpm test`: passed (file-level reporting in sandbox); a second run with
  `--test-isolation=none` exercised individual bodies: 29 passed, six skipped.
- `pnpm exec tsc --noEmit`: passed.
- Targeted ESLint for milestone files: passed. Full `pnpm lint` remains blocked
  by the pre-existing appearance-settings synchronous-effect error.
- `pnpm build`: failed on the known Turbopack sandbox port-binding restriction.
  Webpack inside the sandbox could not parse TypeScript subprocess output;
  `pnpm exec next build --webpack` outside the sandbox passed.
- `git diff --check`: passed.
- PostgreSQL server binaries are unavailable here, so attachment database,
  existing Milestone 4 database and HTTP/browser bodies were skipped. Supabase
  calls in unit tests are mocked; no live account or deployed playback was tested.
