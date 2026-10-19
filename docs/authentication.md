# Authentication

Custom Argon2id password hashing and opaque seven-day sessions use Neon PostgreSQL.
Passwords for signup/change must be 8–128 characters; current-password verification
and matching confirmation are enforced on the server. Session tokens use secure
random bytes, are stored only as hashes, and use HttpOnly, SameSite cookies with
Secure in production. Password changes revoke all sessions, including the caller.
Logout revokes the current database session. Settings can revoke other sessions.

Server Actions and APIs authenticate independently of UI controls. Validation,
origin checks and keyed database rate limits run inside server operations; direct
POSTs cannot bypass frontend controls. AUTH_RATE_LIMIT_SECRET is a shared independent
32+ character production secret. No Auth0/JWT/provider-auth secret is required.
Only the owning server database role can access private tables. No database or
storage credential is exposed to client code.

Public pages do not require credentials at build time. Protected layouts/routes
resolve valid sessions and redirect/deny unauthorized requests. User registration
and login errors are bounded, generic where needed, and never log passwords or raw
connection errors. Allowlisted diagnostics identify operation/stage/code only.
Server-Timing exposes numeric app/pool/database durations for authorized diagnosis.
Use the pooled Neon runtime URL and direct migration URL with verified TLS;
see environment.md and database-security.md. Email changes, account deletion, MFA
and password recovery remain explicitly unavailable rather than inactive promises.

The isolated suites cover signup/login/logout, Argon2id, session revocation/expiry,
CSRF/origin rejection, rate limits, cross-account data isolation and real hydrated
browser forms. No local check alone proves production authentication. Never send
credentials or session cookies to chat when investigating a deployment failure.
