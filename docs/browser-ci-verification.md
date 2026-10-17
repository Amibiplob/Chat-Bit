# Isolated Chrome startup verification

The browser helper previously polled DevTools only 30 times, with 100 ms
between failed connections: roughly three seconds when connections are refused
immediately. A slow cold start therefore produced `Isolated Chrome should start`
even when Chrome was healthy. Chrome stderr was discarded, hiding the difference
between a timeout, a missing library, and a process crash.

The helper now allows 30 seconds, checks the DevTools HTTP response and target,
reports executable/spawn/exit/stderr diagnostics, and stops promptly on process
failure. `--disable-dev-shm-usage` avoids constrained shared memory on CI runners.
The existing isolated profile, loopback endpoint and browser assertions remain.
The workflow checks the installed Chrome version and executes real JavaScript
through the same helper before starting the integration suite. No application
authentication, database grants, secrets or production services are changed.

## Local validation (2026-10-17)

- Real installed Chrome: DevTools connection and JavaScript evaluation passed.
- Two concurrent real Chrome sessions: JavaScript globals remained isolated.
- A wrapper delaying real Chrome by four seconds reproduced the original helper's
  assertion; the updated helper completed the same check successfully.
- Missing executable and early process exit checks passed, reporting `ENOENT`
  and `exit=1` respectively without running the browser callback.
- `pnpm test`: 65 tests, 55 passed, 0 failed, 10 existing integration suites
  skipped because their disposable database/HTTP configuration was unavailable.
  No skip conditions or assertions were changed.
- `pnpm exec tsc --noEmit` and `pnpm lint`: passed.
- `pnpm build`: passed outside the sandbox. The initial sandboxed attempt failed
  while Next.js parsed TypeScript subprocess output.
- `pnpm audit --prod`: passed with registry access; no known vulnerabilities.
- `git diff --check`: passed.

## GitHub Actions verification still required

The failed public Verify run is
<https://github.com/Amibiplob/Chat-Bit/actions/runs/39045086992>.
Its preceding Verify run succeeded with the same helper. Downloading the failed
run's logs returned HTTP 403 without GitHub authentication. The startup deadline
defect is locally reproduced, but whether that specific run timed out or Chrome
crashed cannot be established from the assertion alone. Missing dependencies or
runner permissions have not been demonstrated; the new preflight and stderr
diagnostics will expose them if present.

After an authorized push, Verify must pass the Chrome preflight and the complete
PostgreSQL 17, security, HTTP, messaging, settings, calling and real WebRTC suites
with zero skips, followed by TypeScript, lint, audit and the production build.
The local checks do not establish a successful hosted runner or PostgreSQL 17 run.
