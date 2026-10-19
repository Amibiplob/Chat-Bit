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

## Follow-up: confirmed production Storage 401 responses

Reported production events are `attachment.write / storage-bucket / STORAGE_401`
and `attachment.cleanup / storage-remove / STORAGE_401`. These establish provider
HTTP 401 for the bucket lookup and deletion requests. They do not establish a
missing bucket, invalid JPG, quota failure, or PostgreSQL failure. Reservation
fails before signing/PUT when its bucket lookup returns 401. Cleanup is a
separate failed authenticated request and does not explain away the first error.

Both operations share the same cached server client built from `SUPABASE_URL`
and `SUPABASE_SECRET_KEY`; no alternate cleanup key or browser session is used:

- Bucket lookup: SDK `getBucket(bucket)` → GET `/storage/v1/bucket/:bucket`.
- Cleanup: SDK `from(bucket).remove(paths)` → DELETE
  `/storage/v1/object/:bucket`, JSON body containing private prefixes.
- Both carry the SDK's `apikey` header and `X-Client-Info`; DELETE additionally
  uses JSON Content-Type. No ChatBit session cookie is forwarded to Supabase.

The installed `@supabase/supabase-js` 2.117.3 Storage fetch fallback sends the key
as both `apikey: <key>` and `Authorization: Bearer <key>`. Its Edge Functions fetch
has a separate opaque-key exception that Storage does not use. A synthetic-key
request capture reproduced this for both GET and DELETE without real network
access. This is a confirmed header defect **for new `sb_secret_` keys**, which
are not JWTs. It is not proof that production currently uses such a key.

The server-only client now uses a transport adapter after SDK header construction:
for `sb_secret_` keys it keeps `apikey` and removes Authorization; legacy JWT
headers remain unchanged. The same adapter handles signing, verification reads,
download signing and cleanup. It does not change credentials, bucket privacy,
RLS, application authorization, overwrite protection, or browser signed PUTs.

Official guidance checked during this investigation:

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys

### Production configuration evidence still needed

A metadata-only check of the local environment found Storage URL/key present,
an HTTPS URL without embedded credentials, and no surrounding key whitespace.
The local key matched neither `sb_secret_` nor legacy JWT shape. This says nothing
about Vercel's deployed environment and does not prove the local key valid.
No key values, hashes, prefixes containing secret material or project IDs were
printed. Vercel production key type is currently unavailable to this session.

In the active Vercel **Production** deployment, verify privately and report only:

1. `SUPABASE_URL` present, an HTTPS project API base URL (not a dashboard, database,
   REST, or Storage subpath URL), with no embedded credentials. Confirm it belongs
   to the intended project without sharing the hostname/project identifier.
2. `SUPABASE_SECRET_KEY` present, with no added quotes, whitespace, `Bearer `
   prefix, or JSON wrapper. Classify only as `sb_secret`, `legacy_service_role`,
   `publishable/anon`, `missing`, or `unknown`. For legacy JWTs decode locally and
   check only whether the role is service_role; decoding does not validate the
   signature. Never send a JWT to an online decoder or share payload/claims.
3. Secret is active and belongs to that same project. An opaque secret cannot
   establish project identity by decoding it; compare privately with Dashboard
   settings. Neither a Management API access token nor a publishable/anon key
   satisfies this server credential contract.
4. These are the variables attached to the active deployment, not merely saved
   settings for a future deployment. Confirm Git SHA and actual SDK lockfile.
   Any secret changes or deployment remain separate owner-approved actions.

If production uses `sb_secret`, the reproduced malformed Bearer fallback applies;
verify the correction after an approved deployment. If it uses a valid legacy
service_role JWT, the existing header construction is expected: investigate the
401's safe provider code and URL/key/project/activity checks instead. Do not
assert that either diagnosis is confirmed by HTTP 401 alone.

For the next failure collect the actual provider HTTP status plus the application
response status/requestId, UTC time, operation, stage and allowlisted code.
`STORAGE_INVALID_JWT` distinguishes a provider InvalidJWT code when supplied;
`STORAGE_401` is an HTTP-only fallback and must not be interpreted as a specific
JWT failure. Raw provider messages, headers and request bodies remain private.

Regression tests use the actual installed SDK with a mocked transport and
synthetic credentials. They assert correct new/legacy headers for bucket GET,
signed uploads, verification downloads, download signing and DELETE, and safe
401 diagnostics. They do not prove genuine provider acceptance.

Follow-up verification: `pnpm test` with disposable loopback PostgreSQL 17:
165 passed, 0 failed, 1 skipped (separate HTTP/browser suite). TypeScript,
ESLint, production Webpack build and whitespace checks passed. No live Storage
request, deployment or production mutation was performed.
