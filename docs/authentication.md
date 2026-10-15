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
