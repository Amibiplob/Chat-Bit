# Secure authentication

Milestone 2 adds email/password registration, login and logout to the existing UI.
It reuses the users and sessions tables from migration 001 and adds only
`002_auth_rate_limits.sql`. No application database was migrated automatically.

## Setup

Configure PostgreSQL as described in the README, review the target database, then
run `pnpm db:migrate`. Both migrations are required. Configure
`AUTH_RATE_LIMIT_SECRET` in production using a value generated independently with
`openssl rand -hex 32`; share it across all deployment instances. Keep it private.
Application database roles need DML access to users, sessions and auth_rate_limits.
No authentication provider, email service, ORM or new paid infrastructure is needed.

Registration uses a trimmed display name (1–80 characters), normalized email
(trimmed, lowercase, validated, at most 254 characters), and a password of 12–128
characters. Passwords are never trimmed, normalized or truncated. Long passphrases
and spaces are supported. The database's unique email constraint resolves races;
account and initial session creation commit atomically. Login returns the same
failure message for unknown email and wrong password and verifies a dummy hash
for unknown users. Password confirmation is checked by the registration action.

Passwords use @node-rs/argon2 with Argon2id v19, 64 MiB memory, three passes,
one lane, random salts and 32-byte output. This native library runs in the Node.js
runtime; Next.js's installed external-package list already includes it. Do not
switch these routes to Edge runtime. No password/hash is returned to clients.

## Sessions and authorization

Session tokens contain 32 cryptographically random bytes encoded as base64url.
Only SHA-256 token hashes are persisted. Every session expires after exactly 168
hours; there is no sliding renewal or remember-me extension. A successful login
or registration replaces the presented browser session with a new token and
revokes the previous token in the same transaction. Other devices remain signed in.

Cookies use HttpOnly, SameSite=Lax, path `/`, Max-Age=604800 and an explicit expiry.
Production uses Secure and `__Host-chatbit_session` with no Domain attribute;
local development uses `chatbit_session` without Secure. Deploy over HTTPS.
Logout is a POST Server Action, revokes the database row before clearing the
cookie and redirects to login. Database failures do not falsely report logout
success; the user gets an error and can retry.

`getCurrentUser` checks the hashed token and database expiry and returns only
id, email and displayName. React cache deduplicates lookup within a request;
it is not a cross-request session cache. Application layout and each protected
page invoke `requireUser`; guards therefore also run when a layout is reused.
Login/signup redirect authenticated users to chat. Message and attachment DAL
wrappers independently require the current session and retain their membership
joins. They no longer accept a caller-selected user ID.

## Abuse protection

Limits are stored in PostgreSQL and updated with atomic UPSERTs, using database
time and a committed transaction. Counters persist when access is denied and
expire after a fixed window; traffic does not extend that window. A store error
fails authentication closed. No in-memory counter is used for rate limiting.

| Operation | Per normalized email | Per client |
| --- | --- | --- |
| Login | 10 attempts / 15 minutes | 30 attempts / 15 minutes |
| Registration | 5 attempts / hour | 10 attempts / hour |

Bucket identifiers use HMAC-SHA256 with AUTH_RATE_LIMIT_SECRET; raw emails and IP
addresses are not stored in the rate-limit table. Successful attempts also count.
The client cap is checked first to avoid creating new email buckets after denial.
On Vercel, only its overwritten `x-vercel-forwarded-for` IP header is trusted.
Outside Vercel, all requests share a conservative client bucket; arbitrary
forwarded headers cannot bypass the cap. A self-hosted multi-user deployment needs
an explicitly trusted proxy/IP strategy before increasing this restriction.
Account-level limits can temporarily block legitimate users during targeted
abuse; IP limits also affect users behind a shared NAT. Rotate the secret with
care: changing it resets rate-limit identity but does not invalidate sessions.

Server Actions use Next.js POST/origin checks. The actions additionally require
a valid Origin matching Host and reject absent, opaque and cross-origin requests.
There is no permissive allowedOrigins list. Server Action body size is capped at
16 KiB. All inputs are validated server-side; SQL is parameterized. Unexpected
errors return safe messages and are not logged with credentials or SQL details.
Redirects occur outside catch blocks. Reverse proxies must preserve the public
Host/Origin relationship rather than disabling these checks.

## Operations and limits

Schedule expiry cleanup using your database's supported scheduler or an
authenticated maintenance job. Expired rows are denied regardless of cleanup.
These statements delete only expired authentication metadata, not users/messages:

```sql
DELETE FROM sessions WHERE expires_at <= now();
DELETE FROM auth_rate_limits WHERE expires_at <= now();
```

No scheduler was provisioned or cleanup executed against an application database.
Email verification, password recovery and MFA are not implemented. The UI does
not claim email verification or functional recovery. Settings now supports
reauthenticated revocation of other sessions.
Conversations and messaging now persist in PostgreSQL; [Milestone 7 settings](settings.md) adds profile/password/session management and
account preferences. [Milestone 6 calling](calling.md) uses the same
verified sessions for participant-only signaling. The authentication milestone
does not establish full application production readiness or deployed reliability.

## Verification

Unit tests validate passwords, random Argon2 salts, cookie policy, token validation,
origin rejection, trusted client identity and safe errors. Isolated PostgreSQL
tests verify registration, duplicate races, login, session rotation/expiry,
logout, validation and concurrent account/client quotas. Optional HTTP tests use
the real progressive-enhancement forms and Next.js Server Actions, checking
protected routes (including RSC), cookies, redirects, errors and cross-origin
registration/login/logout denial. These are HTTP tests, not full browser tests.

References checked against the installed Next.js guides and official sources:
[Next.js data security](https://nextjs.org/docs/app/guides/data-security),
[cookies](https://nextjs.org/docs/app/api-reference/functions/cookies),
[Argon2 library](https://github.com/napi-rs/node-rs/tree/main/packages/argon2), and
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

Milestone 7 password changes reauthenticate, update Argon2id hashes and revoke all
sessions atomically. Login locks and rechecks the verified hash before issuing a
session. See [settings lifecycle](settings.md) for supported account controls.

## Investigating authentication availability on Vercel (2026-10-18)

The exact `Authentication is temporarily unavailable. Please try again.` message
is returned only by `publicAuthError` for an unexpected (non-`AuthError`) failure
caught in the login/register Server Action. It is not evidence of a bad password,
short password, origin rejection or rate-limit denial: those have explicit public
errors. The action previously discarded the unexpected exception without logging
anything. The added `chatbit.auth.unavailable` event repairs that diagnostic gap;
it does **not** establish or resolve a particular deployed incident.

Trace: the browser validates shared schemas and dispatches the Server Action;
the action checks origin, reads cookies, checks the rate-limit secret and creates
the lazy database pool. Both services first write rate-limit buckets inside a
transaction, then validate input. Registration hashes with Argon2id and inserts
the user and hashed-token session atomically. Login selects the hash, verifies it,
locks/rechecks it inside a transaction and creates a session. Both commit before
the action writes its secure host-only seven-day cookie and redirects to `/chat`.
Rate-limit storage errors fail closed before credential validation. Errors in
pool acquisition, SQL, hashing, BEGIN/COMMIT or cookie creation can reach the same
generic response. A cookie failure can occur after database COMMIT; do not assume
a failed signup response proves that no account was created.

Local environment inspection (values never printed) passed the production auth
configuration contract: DATABASE_URL, verified TLS/CA and AUTH_RATE_LIMIT_SECRET.
The local runtime URL selects a Supabase transaction pooler and contains no TLS
URL parameters. This is configuration shape evidence, not a Vercel environment
comparison or a live connection test. No production connection, mutation or
credential change was performed for this investigation.

Privately verify the **active Vercel deployment's** Production/Preview scope:

- DATABASE_URL must be the intended runtime Postgres connection, not the Storage
  URL/API key or merely DATABASE_MIGRATION_URL. Use the Dashboard-provided host,
  database and pooler username, with a percent-encoded database password.
- DATABASE_SSL must be `verify` (also the default); DATABASE_SSL_CA is optional
  provider CA PEM text, not a file path, quoted JSON or literal `\\n` sequences.
  No `ssl*`/`uselibpqcompat` URL parameters are accepted, including `sslmode=require`:
  pg URL options can replace the explicit verified TLS object.
- AUTH_RATE_LIMIT_SECRET must be server-only and at least 32 characters, shared
  across instances. DATABASE_POOL_MAX defaults to 3 (valid 1–20 per instance).
  Never disable TLS/rate limits or broaden database permissions to bypass errors.
- Node 24 is the supported runtime. Do not set CHATBIT_AUTH_HTTP_TEST in deployment.
  Storage/TURN/cron variables do not participate in login or signup.
- Migration success and a separate TLS check do not establish that the deployed
  runtime uses the same endpoint/role/schema/CA. Migration 008 enables RLS without
  API policies; a separate restricted role needs a reviewed RLS/grant strategy,
  including trigger-function access (see database-security.md). DML grants alone
  are insufficient. Do not grant API roles access or disable RLS.

Supabase recommends transaction pooling for serverless functions. Auth queries
have no named prepared statements and transactions retain one PoolClient from
BEGIN through COMMIT/ROLLBACK; no session-level auth state is assumed. Session
pooling also supports these SQL operations, with different connection budgeting.
The pg `statement_timeout` option is sent during connection startup; its effective
handling by a particular pooler is not proven by a local build or TLS check.
Do not remove timeouts or change pooler modes without runtime evidence.
See [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[timeouts](https://supabase.com/docs/guides/database/postgres/timeouts),
[pg SSL](https://node-postgres.com/features/ssl) and
[named queries](https://node-postgres.com/features/queries).

### Runtime evidence needed

For one failed POST `/login` or `/signup`, collect timestamp **with timezone**,
Vercel request ID, deployment commit/environment, Node runtime and function region.
Look for `chatbit.auth.unavailable` on a deployment containing this change. Its
only fields are operation, stage and a strict allowlisted code (or UNCLASSIFIED).
Expected auth errors produce no availability event. Stages distinguish request,
auth-secret, database-config, authentication (service/transaction) and
session-cookie failures. Wrapped/aggregate network errors retain allowlisted
codes; no raw exception/message/stack, SQL or parameters are logged.

Useful codes: 28P01/28000 = database authentication; 42501 = privilege/RLS;
42P01/42703 = missing relation/column; 53300 = connection capacity;
57014 = query cancellation; 40001/40P01 = serialization/deadlock;
ENOTFOUND/EAI_AGAIN/ENETUNREACH/ECONNREFUSED/ETIMEDOUT = network;
certificate codes identify TLS failures. These are diagnostic categories,
not confirmed causes for the reported incident.

If UNCLASSIFIED or running older code, supply any existing original exception
name/code and a **manually redacted** stack (module/function/line only), plus a
matching sanitized Supabase log if available. Older catches may have emitted no
exception at all; say that explicitly. Do not paste URLs, hosts/project IDs,
credentials, headers/cookies/tokens, email/password, SQL parameters, row contents
or certificate contents. Report only variable presence/contract pass/fail,
connection mode/port and whether the deployed runtime role/schema match the
migration target. Do not send environment dumps or unredacted error objects.

After any separately authorized environment corrections, a new deployment must
use those settings. This investigation does not push, deploy, mutate production
records or claim deployed login/signup is fixed without runtime evidence.

Verification: 63 tests passed, zero failed, 10 database-dependent suites skipped;
TypeScript, ESLint, Webpack production build and whitespace checks passed. Build
traces include pg and the Argon2 native binary for login/signup (local packaging
evidence only). Isolated real Chrome against a loopback production server passed
the public frontend journey and a deliberate missing-DATABASE_URL failure: the
real login Server Action returned the generic message and logged database-config /
UNCLASSIFIED without the raw exception. Database/storage URLs were explicitly
blank; no live PostgreSQL or deployed Vercel authentication test was performed.
