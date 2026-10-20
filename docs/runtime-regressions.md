# Authentication and theme runtime regressions

Next loads `.env.local` before `.env`; an inherited process variable wins over
both. Loading `.env` explicitly in a standalone command can therefore disagree
with `next dev`. Keep only one intended `DATABASE_URL` assignment across local
files and restart the development process after changing configuration. Never
paste connection strings or driver errors into diagnostic output.

Session verification is lazy for absent/malformed cookies. A well-formed token
queries the database; missing/expired sessions return no user. Configuration,
connectivity, permissions and schema failures throw a redacted error retaining
an allowlisted diagnostic code. `DATABASE_CONFIG` means validation failed before
connecting; `42501` means insufficient privileges; `42P01` means a missing table;
`28P01` means rejected database credentials. Never convert these outages into an
authenticated user or silently treat them as missing sessions.
Session failures also emit `chatbit.auth.unavailable` with only the fixed
operation `session`, stage `authentication`, and allowlisted diagnostic code.
No cookie, connection string, driver message, SQL or stack enters that event.

The theme bootstrap is an external React-compatible async script in the document
head. `blocking="render"` makes the browser wait for it before painting. Unlike
inline scripts (including the inline queue emitted by `beforeInteractive`),
React can load it during client recovery after a server render fails. The
existing theme provider still handles saved preferences, device changes and
cross-tab updates. The font variables and body sizing remain in the root layout.

Run isolated authenticated HTTP/browser tests with `TEST_AUTH_HTTP=1`,
`TEST_DATABASE_URL` pointing only to a disposable PostgreSQL instance,
`TEST_DATABASE_SSL=disable` for loopback, `TEST_NEXT_TURBOPACK=1`, and
`CHROME_BIN` identifying Chrome. Then run `pnpm test`. The test server uses its
own build directory and a versioned TypeScript config outside `.next` so
Turbopack can resolve it.

For the recovery regression, start a **separate local test server** with
`DATABASE_URL=invalid-runtime-test` (an intentionally invalid synthetic value).
For development also set `CHATBIT_AUTH_HTTP_TEST=1` and run Next dev with
`--turbopack`. Set `TEST_RUNTIME_ORIGIN` to its loopback origin, set `CHROME_BIN`,
and `TEST_RUNTIME_DATABASE_FAILURE=1`, and run
`node --test tests/runtime.browser.test.mjs`. Without the failure flag, the test
expects a working database and checks that an unknown session stays signed out.
For production, run
`pnpm build`, start Next with the same intentionally invalid environment, and
also set `TEST_RUNTIME_PRODUCTION=1` for the test command.

The browser regression checks public navbar/login/signup with missing and
malformed cookies, theme changes and reloads, bootstrap loading before first
contentful paint, and script/hydration warnings during forced authentication
error recovery. A well-formed synthetic cookie must still produce HTTP 500 in
the deliberately broken test server. This is separate from isolated successful
session tests and read-only live-provider checks.

## Reverification on 2026-10-20

The starting checkout already contained the lazy session verification and
external async bootstrap in commit `a3b6b2b`. Next's environment loader selected
`.env.local` and `.env`; the effective database assignment matched `.env` and
validated as pooled Neon with verified TLS. Read-only connection, session lookup
with a synthetic token, and SELECT/ownership checks for users/sessions passed.
No current Neon connection or permission failure was reproduced. No live writes
or credential changes were performed.

As a temporary negative control, replacing the external async bootstrap with
`next/script` using `beforeInteractive` reproduced one script-rendering warning
in Chrome during forced session-error recovery on Turbopack 16.3.8. Restoring the
external async script passed the browser regression with no script/hydration
warnings and correct light/dark/system themes at first contentful paint.

The follow-up changes add sanitized session availability events and distinguish
working-database browser checks from deliberately broken configuration checks.
Successful and expired session verification also runs against disposable local
PostgreSQL. The full isolated suite passed 185 tests with two opt-in suites
skipped; typecheck, lint and `pnpm build` (Webpack) passed. Separate Chrome
runtime tests passed on both Turbopack development and the local production
build, including forced database-error recovery with no script or hydration
warnings. Production public/unknown-session checks also passed with the existing
configuration. These local results do not prove a real user's Neon session or
production deployment behavior.
