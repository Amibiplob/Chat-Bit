# Deployed attachment investigation

The reported working text messages and avatars do not verify Supabase Storage.
The deployed attachment root cause is still unconfirmed without its request ID
and failure event. No production credentials, data, bucket settings or deployment
were changed. Source inspection describes this checkout; the active production
commit must be checked in Vercel.

## Independent upload paths

| Property | Profile avatar | Chat attachment |
| --- | --- | --- |
| Entry | POST `/api/settings/avatar` with image bytes | POST `/api/conversations/:id/attachments` with JSON metadata |
| Backend | PostgreSQL `profile_avatars.content` bytes | Private Supabase Storage bytes; PostgreSQL reservation/message metadata |
| Client | Server PostgreSQL pool; `sharp` normalization | Server `@supabase/supabase-js`; browser XMLHttpRequest |
| Transfer | Browser → application → database | Server signs non-overwriting upload; browser PUT directly to signed Storage URL |
| Limits | 256 KiB input/output, bounded raster decode, normalized PNG | 10 MiB per file, 100 MiB account quota including reservations |
| Authorization | Session, same-origin mutation, settings rate limit; owner/partner avatar reads | Session, same-origin mutation, rate limit, conversation membership, uploader ownership; downloads reauthorize live attachment/message |
| Storage configuration | None | `SUPABASE_URL`, server-only `SUPABASE_SECRET_KEY`, optional `SUPABASE_STORAGE_BUCKET` |

Both paths need runtime PostgreSQL/session configuration. Attachment credentials
are separate from PostgreSQL credentials. No Supabase Auth browser session or
public Storage key is used. The server key stays on the server; the browser gets
only a narrowly scoped signed upload URL. Completion POST to
`/api/conversations/:id/attachments/:id/complete` reads bytes back through the
server SDK, verifies size/type, and commits the attachment/message atomically.

`chatbit-attachments` is the default bucket. A deliberate
`SUPABASE_STORAGE_BUCKET` override selects a different existing private bucket.
Migrations 001–008 create ChatBit database objects, not this Storage bucket.

## Exact error and diagnostic defects

`failureDetails()` in `lib/server/messaging-diagnostics.mjs` emits
“File storage is temporarily unavailable. Please try again.” with application
HTTP 503 for unexpected non-timeout errors tagged `storage-*`.
`messagingResponse()` returns it with a generated requestId and X-Request-ID.
The direct browser PUT uses different messages. Thus the reported exact wording
points to a server Storage call, not necessarily the transfer itself:

- Reservation: `attachments.reserve` → `createAttachmentUpload` → configuration
  → `getBucket` privacy/limit check → `createSignedUploadUrl`.
- Completion: `verifyAndFinalize` → `readAttachmentObject` → configuration →
  `getBucket` privacy/limit check → SDK download → byte verification → persistence.
- Attachment download/preview can also emit the same wording.

The existing wrappers intentionally hide raw provider messages. Confirmed
observability defects: `providerCause` discarded SDK symbolic codes when an HTTP
status was present; `diagnosticCode` did not inspect the SDK's `originalError`
network wrapper; missing configuration and distinct bucket-policy failures were
indistinguishable. These now retain only fixed allowlisted diagnostic codes.
No upload behavior/security policy was changed, and no production upload fix is
claimed without evidence.

Storage errors still propagate to the response wrapper. Reservation-signing
failure schedules cleanup; completion preserves transient retryability. Cleanup
catch blocks log safe failures without overriding the original error. Browser
best-effort cancellation cleanup suppresses its secondary failure; it does not
replace the upload error. Avatar raster decoding catches intentionally return a
safe validation message.

## Read-only owner verification

In Vercel, inspect the active production deployment's Git SHA and **Production**
environment variable presence (do not copy values). Check the Storage endpoint
and server secret belong to the same intended Supabase project; the secret must
have the required server Storage privileges, not be a publishable/anon key.
Verify the selected bucket override locally in the dashboard without sharing it.

In the Supabase dashboard, open Storage → selected bucket → configuration and
inspect without saving. Alternatively, run only this read-only SQL in the
intended project's SQL editor (substitute a deliberate override privately):

```sql
BEGIN READ ONLY;
SELECT public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'chatbit-attachments';
ROLLBACK;
```

- No row: that bucket does not exist in the selected project. Verify project and
  override before proposing any creation; dashboard identity does not prove the
  deployed key has access.
- `public` must be false. Do not make it public or add public policies.
- This application's existing guard requires an explicit positive integer limit
  of at most 10485760 bytes. Null/unset, zero or greater than 10 MiB is rejected
  **before signing**, even for a small JPG. Use exactly 10485760 for the full
  advertised limit; smaller configured limits reduce actual supported sizes.
- Inspect allowed MIME types: JPEG must be permitted (or MIME restriction unset).
  Check the project-wide upload cap also permits the intended file size.
- Inspect existing Storage policies read-only; no public access is required by
  this custom-session/signed-upload architecture. Do not alter RLS or credentials
  as a diagnostic shortcut.

Bucket creation, privacy/limit changes, key changes and Vercel updates require
owner approval. This investigation performs none of them.

## Evidence to collect from the next failing attempt

In browser Network, identify the failing request without sharing its full URL:
reservation POST, direct Storage PUT, completion POST, or preview/download GET.
Record UTC timestamp, method, redacted route template, **actual HTTP status**,
and response requestId/X-Request-ID. For server requests, find the matching Vercel
`chatbit.messaging.failure` event; share only `operation`, `stage`, `code`,
`category`, `requestId`. The public 503 is not the provider's actual HTTP status.

| Stage/code | What it establishes |
| --- | --- |
| `storage-config` / `STORAGE_CONFIG_URL`, `STORAGE_CONFIG_KEY`, `STORAGE_CONFIG_BUCKET` | Which local configuration guard failed |
| `storage-bucket` / `STORAGE_BUCKET_NOT_FOUND` | Provider reports NoSuchBucket; verify existence and permissions separately |
| `storage-bucket` / `STORAGE_BUCKET_PUBLIC`, `STORAGE_BUCKET_LIMIT`, `STORAGE_BUCKET_METADATA` | Which local bucket metadata/security guard failed |
| Storage stage / `STORAGE_INVALID_JWT`, `STORAGE_ACCESS_DENIED`, `STORAGE_INVALID_SIGNATURE` | Allowlisted provider auth/signature diagnosis |
| Storage stage / `STORAGE_400`, `STORAGE_401`, `STORAGE_403`, `STORAGE_404`, etc. | HTTP-only fallback; does not establish a specific cause |
| Storage stage / `ETIMEDOUT`, `STORAGE_504`, etc. | Network/provider timeout |

For a direct PUT failure provide actual HTTP status, elapsed time, abort/timeout
state and only the provider's error code. Never share signed URLs, request
headers, cookies, tokens, raw provider error objects, file content or HAR files.
Older deployed revisions may only emit coarse codes; collect those as-is and
verify the deployed SHA before expecting new codes.

Provider code meanings: https://supabase.com/docs/guides/storage/debugging/error-codes

## Verification

- `pnpm test` on disposable loopback PostgreSQL 17 with the security fixture:
  162 passed, 0 failed, 1 skipped (separate HTTP/browser suite).
- TypeScript, ESLint, production Webpack build and `git diff --check` passed.
- New regressions cover missing configuration, bucket guards, SDK symbolic codes,
  unknown-code redaction and bounded nested network error extraction.
- Provider responses are mocked; no live Supabase upload or authenticated
  production request was performed. No production data was written.
