# Final production handoff — 2026-10-23

The local implementation is complete for this project phase. Production acceptance
is still pending. This pass preserves the existing Next.js App Router, Neon,
PostgreSQL polling, WebRTC and browser PWA architecture. No feature provider was
activated, no production data or credentials were changed, and nothing was pushed
or deployed. Migrations and private environment files are unchanged.

## What is complete

- Responsive authenticated workspace with persistent sidebar/mobile tabs and
  visited panels; bounded account-scoped conversation RAM, drafts and scroll state.
- Synchronous local text acceptance with honest pending/failed states, stable
  submission IDs, durable acknowledgement, retry and polling recovery.
- Membership-authorized messaging, replies, edits, deletion, read receipts,
  contacts, profile/privacy/password/session controls and redacted errors.
- Private attachment reservations, signed uploads, server byte verification,
  sealed completion, quota/size policy, authorized media/downloads and cleanup.
- Browser voice/video calls with authorized signaling, ownership/lease checks,
  permission/error handling, mute/camera controls and media disposal.
- Manifest/icons, browser installation controls, manual instructions and a public
  offline fallback. The worker caches only `/offline.html`; it never caches private
  messages, sessions, API responses or attachments.

No critical application defect remains confirmed by the local checks. The media
viewer had a lifecycle defect: React Strict Mode replay could consume its history
entry and immediately close the dialog. A stable marker and deferred unmount
cleanup now preserve one entry through replay; web Back and Close retain the
conversation and media cleanup. Authentication and storage authorization are unchanged. Three test-harness issues were corrected:
Retry now selects the intended failed message instead of a previous submission's
transient button; Chromium profile deletion retries bounded `ENOTEMPTY` races;
and the exact call-poll interval assertion now uses an injected fixed clock instead
of wall-clock milliseconds. Application timing and retry behavior are unchanged.
Phone/tablet/desktop portrait and landscape coverage and worker-update isolation
checks were expanded. CI now enables the existing workspace/navigation,
optimistic-send, Turbopack, SDK-fixture and native WebRTC regressions, plus production
theme/authentication-error recovery. These checks previously needed manual flags.

## Verification evidence

Validation uses Node **24.22.1**, pnpm **12.3.4**, disposable loopback PostgreSQL
**17.10**, real headless Chrome and the installed Brave browser. No live Neon data
is used. Storage tests use mocks/offline SDK signing; WebRTC uses synthetic devices.

- Standard suite: **135 passed, 17 infrastructure-gated skips**.
- Expanded disposable PostgreSQL 17/Chrome/Turbopack suite: **236 passed,
  0 failed, 1 skipped**. The skipped production theme/authentication-outage
  browser regression passed separately (**1 passed, 0 skipped**). The expanded
  run includes security grants, HTTP authentication, attachment authorization,
  cached navigation, retry/idempotency, the loopback SDK transport fixture and
  native WebRTC with synthetic media. No hosted push provider was activated.
- TypeScript, ESLint, Webpack production build and whitespace checks pass.
- Chrome production smoke: **56 public route/viewport checks** across 320×568,
  390×844, 430×932, 768×1024, 1280×800, 568×320, 844×390 and 1024×768.
  Hydration/errors, signup validation, themes, simulated install/dismissal,
  private-cache isolation and offline navigation pass.
- Production first-paint themes and fail-closed authentication recovery pass
  separately with an intentionally unavailable loopback database configuration.
- Service-worker activation retires only old ChatBit public fallback caches and
  claims existing tabs; unrelated caches remain untouched.
- Public production `/`, `/login`, `/signup`, manifest and worker returned 200 over
  HTTPS with `nosniff`. Manifest name/start/scope/display match the intended PWA.
  This public-only check does not identify the deployed commit or verify login.
- A tracked-file private-key/token-pattern scan found zero candidates; only
  `.env.example` is tracked. This bounded scan does not audit Git history or prove
  the absence of every possible secret.
- Workflow YAML and browser flags parse and preserve read-only repository permissions.
  A remote GitHub Actions run is still required after the owner's manual push.

Fresh loopback development measurements below are small samples, not production
percentiles or a delivery guarantee. Optimistic rendering and network delivery
are measured separately; PostgreSQL polling remains the default transport.

| Stage | Samples | p50 | p95 |
| --- | --- | --- | --- |
| Click to optimistic message DOM | 12 | 19 ms | 76 ms |
| Send request to server acknowledgement | 12 | 97 ms | 869 ms |
| Click to confirmed sender DOM | 12 | 150 ms | 895 ms |
| Click to recipient DOM | 12 | 952 ms | 1,343 ms |
| Warm cached conversation DOM | 10 | 27 ms | 39 ms |
| Visited workspace panels with 1,500 ms delayed fetch | 30 | 16 ms | 24 ms |

Warm cached conversation switches made zero RSC requests and caused zero shell
remounts. The native calling-controller simulation reached negotiated transport
and remote media in 2,109 ms in one local sample; this is not TURN or device proof.

## Known limitations and launch prerequisites

1. **Configuration preflight is blocked by the ICE/TURN group locally.**
   `pnpm config:check` reports `CALL_STUN_URLS / CALL_TURN_URLS /
   CALL_TURN_SHARED_SECRET` as missing or invalid. It does not connect to services.
   Supply matching infrastructure configuration yourself and rerun it; do not
   invent credentials or weaken the checker. STUN-only calling cannot guarantee
   cross-network reachability. Real camera/microphone permissions, mobile audio,
   TURN relay and calls across two networks remain unverified.
2. Review the intended Neon branch, matching pooled/direct URLs, strict TLS and
   migration history. Apply only reviewed pending migrations; never reset an
   initialized database or edit applied SQL to repeat a setup checklist. The local
   tests do not prove live Neon TLS, regional latency, pool capacity or availability.
3. Keep Object Storage private with the exact endpoint/region, scoped credentials
   and exact-origin CORS. Real image/video/document upload, preview, seeking,
   full-screen Back, signed download, cancellation/retry and cleanup need acceptance
   on the intended branch. Native picker behavior and codec support vary by device.
4. Configure authenticated cleanup: calls every minute, attachments every five
   minutes and maintenance hourly, and monitor bounded-work backlogs. No scheduler
   or backup service is provisioned here. Choose an operational recovery policy.
5. Select Node 24.x on Vercel, preserve the frozen pnpm lockfile and Webpack build,
   and verify the actual deployed commit and security-patched Node runtime. Local
   Node/CI pins do not prove Vercel's patch rollout. No new environment names are
   introduced by this final pass. See [deployment](deployment.md) and
   [environment names](environment.md).
6. Run the [two-account/device checklist](manual-test-plan.md) on the reviewed HTTPS
   deployment. Actual Android installation, keyboard/system Back, physical devices,
   Firefox/Safari, native permissions and web deployment update behavior are not
   established by Chromium emulation or a simulated install event.

Polling remains the default transport; background throttling and network latency
limit recipient delivery. Optional Ably code is opt-in, with local SDK protocol
fixtures only; no hosted provider acceptance or true production push is claimed.
There is no end-to-end message encryption, offline outbox, closed-app incoming
calling, group calling, password recovery, MFA or self-service account deletion.
Attachments remain limited to 10 MiB each and 100 MiB per uploader.

The final dependency refresh patches the moderate development-tooling
`ip-address` IPv6 parsing advisory by updating only its lockfile resolution from
10.7.2 to 10.7.4. Frozen installation and both dependent resolution paths pass;
valid IPv6/zone inputs and the advisory's malformed-zone input were checked.
The fresh production dependency audit reports zero known findings. The full
dependency review retains one high development-tooling `braces` advisory with
no published fix and the ESLint 9 support limitation. Use trusted tooling patterns
and isolated CI without production secrets. See [dependency security](dependency-security.md)
for exact advisories and mitigations. A passing production audit is not proof of
absence of vulnerabilities.

## If a critical failure occurs

Pause release and use the previous known-good Vercel deployment if a deployed
regression prevents core use. Confirm the deployment commit and environment scope
before changing anything. Capture the time, browser/device, operation, response
status, request ID and redacted diagnostic stage/code; never copy tokens, cookies,
private messages, object URLs, SDP/ICE or connection strings into reports.

For authentication or storage outages, preserve fail-closed behavior and check
configuration/provider availability before retrying. For missing messages, retain
failed entries/drafts and retry the existing submission instead of generating
multiple new sends. For calling failures, end the call, verify tracks stop, then
check permissions and TURN on two networks. Follow the deployment/readiness checks
without rerunning applied migrations or changing database grants as a workaround.
No further feature work is required to complete this phase; outstanding work is
operator configuration and manual production acceptance.
