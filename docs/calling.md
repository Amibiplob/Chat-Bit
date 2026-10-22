# Voice and video calling

ChatBit supports one-to-one native WebRTC audio/video calls from conversation
headers and the Calls page. PostgreSQL, custom ChatBit sessions and authenticated
HTTP polling remain the application backend. Neon Object Storage remains file storage only.
No group calling, screen sharing, recording, media storage or new provider SDK
is included. No application database or environment file was changed by this work.

## Signaling and deployment

Calling uses `db/migrations/005_calling.sql`. Check the selected target's
migration history and apply only reviewed pending migrations with `pnpm db:migrate`;
do not rerun setup against an initialized database unnecessarily. Builds never
migrate. Migration 005 extends the calls table with tab/
session ownership, timestamps, end reasons and bounded signal sequencing. It
adds per-user busy slots and temporary signal records. Legacy unfinished demo
calls are marked failed; existing history is retained. No prior migration is
edited. Application runtime roles need DML on calls, call_slots, call_signals,
users, conversation_members, sessions and auth_rate_limits.

Each Vercel Route Handler finishes a short request. Idle visible tabs poll every
three seconds; calls in progress poll every second, including hidden tabs while
browser scheduling permits. Hidden idle tabs stop requests and catch up on focus.
This is durable HTTP signaling, not a persistent connection. It fits the existing
Next.js App Router/pg deployment without another signaling server.
[Vercel Functions support ordinary HTTP handlers](https://vercel.com/docs/functions/functions-api-reference).
The implementation uses HTTP polling for signaling and does not rely on
a persistent WebSocket server.

Signals are small SDP/ICE messages stored only until negotiation no longer needs
them. Audio/video flows between browsers through encrypted WebRTC transports;
TURN relays encrypted packets when required. PostgreSQL never stores media.

| Endpoint | Purpose |
| --- | --- |
| GET /api/calls | Latest 50 authorized call-history rows |
| POST /api/calls | Idempotent invitation for an existing conversation |
| POST /api/calls/sync | Scoped call state, remote signals and owner heartbeat |
| POST /api/calls/[id] | Accept, reject, cancel, connected, end or failure |
| POST /api/calls/[id]/signals | Bounded, idempotent SDP/ICE submission |
| GET /api/calls/[id]/ice?tabId=... | Owner-only STUN/temporary TURN configuration |
| POST /api/calls/cleanup | Secret-authenticated bounded maintenance |

Configure an external scheduler to POST `/api/calls/cleanup` every minute with
`Authorization: Bearer <CALL_CLEANUP_SECRET>` (32+ random characters). Nothing
provisions this scheduler automatically. Cleanup expires at most 100 stale calls
and deletes at most 1,000 expired signal rows per invocation. Participant requests
also reconcile their own stale calls, so returning users recover without waiting
for maintenance. If no scheduler runs and nobody returns, stale database rows
wait for the next invocation. External calls and builds never migrate the database.

## STUN and TURN

All configuration below is server-only. Use placeholders in documentation;
never commit real values or put shared secrets in NEXT_PUBLIC variables.

```text
CALL_STUN_URLS=["stun:stun.l.google.com:19302"]
CALL_TURN_URLS=["turn:relay.example.com:3478?transport=udp","turns:relay.example.com:5349?transport=tcp"]
CALL_TURN_SHARED_SECRET=replace-with-a-random-secret-of-at-least-32-characters
CALL_RELAY_ONLY=0
CALL_CLEANUP_SECRET=replace-with-an-independent-32-character-random-secret
```

STUN defaults to the public Google endpoint above. Set `CALL_STUN_URLS=[]` to
use no external STUN (for local isolated testing). STUN assists address discovery;
it does not provide relay connectivity across every NAT/firewall.

TURN is optional configuration, but required for reliable connectivity across
restrictive networks. Supply a manually operated coturn server or a provider
supporting the coturn TURN REST shared-secret mechanism. Configure `use-auth-secret`,
the same private shared secret, a realm, valid TLS certificates for turns, public
relay addresses and permitted relay ports on your server/firewall. Limit relay
abuse and monitor transfer costs. This repository provisions neither a relay
nor a paid/free provider account. No free TURN service is assumed.

Only an authenticated participant in the owning call tab may request ICE config.
The server generates a username containing an expiry timestamp one hour ahead
and a pseudonymous user/call identifier, and signs it with HMAC-SHA1/base64,
following [coturn's temporary-credential protocol](https://github.com/coturn/coturn/blob/master/README.turnserver).
The browser receives only these temporary credentials, never the shared secret.
They can still be reused until expiry; call termination is not instantaneous
TURN credential revocation. Calls are capped at 55 minutes so a connected session
finishes before its initial credentials expire. Arbitrary provider-specific
credential APIs and static long-lived passwords are not supported.

Use `CALL_RELAY_ONLY=1` to force relay selection during deployed TURN verification.
It fails closed without TURN URLs and a valid shared secret. Inspect the selected
candidate pair in browser WebRTC statistics and test two different networks.
A successful same-machine test does not prove TURN or universal connectivity.

## Security and call state

The current ChatBit session determines the actor for every operation. SQL joins
both intended participants and current conversation membership. Call IDs and tab
IDs are UUID-validated; request fields are strict. Mutations require same-origin
Origin/Host and a JSON body under the existing 64 KiB streaming request cap.
SDP is capped at 48,000 characters, ICE candidates at 4,096 characters, with
bounded auxiliary fields. No API accepts arbitrary actor/recipient IDs. API
responses use no-store; raw session hashes and ownership IDs are excluded from
DTOs, and signaling payloads are never logged by the implementation.

Creation locks both participant users in canonical order. Database unique busy
slots reserve each participant across conversations, and the conversation also
has a unique live-call index. Simultaneous/cross-direction calls have one winner;
the other receives a busy response. Invitations use a UUID client key for retries.
The callee must explicitly accept or reject. Row locks serialize all transitions.
Only one recipient tab can claim acceptance, even under concurrent requests.

The caller's original session/tab owns its media; the first accepting callee
session/tab owns the other side. Other tabs see a status banner and receive no
SDP/ICE or TURN credentials. Refresh does not transfer ownership: page departure
attempts an authenticated keepalive termination, and stale leases recover if it
cannot be delivered. Tab UUIDs live in the mounted provider, not shared storage.
Multiple tabs may see an invitation; the first valid accept/decline wins.

States are ringing, connecting, active, rejected, missed, cancelled, ended and
failed. Live-state/timestamp constraints and atomic transitions prevent double
answers and invalid actions. Terminal operations are idempotent for an owning
tab, but terminal calls cannot be reactivated. Active state records a browser's
connected report, not proof that a person heard audio. Duration is derived from
connected_at/ended_at; failed negotiations have no established duration.

Only the fixed caller sends one offer and only the callee sends one answer.
Camera/mute controls change track.enabled without renegotiation. This avoids
offer glare without requiring full perfect-negotiation machinery. Voice calls
cannot be upgraded to video mid-call; start a new video call. The client buffers
[ICE candidates until a remote description exists](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate).
Remote signals are ordered, cursor-deduplicated, bound to a call and delivered
only to the opposite owner. UUID retries must preserve the exact signal payload.
There are at most 512 signals per call, and at most 100 retained ICE candidates
per sender. Descriptions cannot be injected by the wrong participant or tab.

Shared PostgreSQL limits per user/minute: 10 create, 120 sync, 300 signal, 60
action, 60 history and 60 ICE-config requests. They use the existing production
AUTH_RATE_LIMIT_SECRET and atomic expiring counters across instances. Several
visible tabs share these limits; reduce idle tabs if they exhaust the sync budget.
Idle calls polling is roughly 1,200 requests/hour per visible tab, in addition to
messaging polling. Active call signaling uses roughly 3,600 sync requests/hour
per participant. Budget Vercel/database usage; this is a portfolio-scale design.

## Media and lifecycle

The app requests getUserMedia only after Start or Accept. The callee claims the
call before prompting for media so another tab cannot answer simultaneously.
Permission/device errors are shown with recovery instructions. Calling requires
[a secure context (HTTPS or trusted loopback)](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
and browser support for RTCPeerConnection, mediaDevices and MediaStream.

The modal includes incoming Accept/Decline, local camera preview, remote playback,
mute, camera enable/disable, End, connection status and a duration display.
Controls have accessible labels, keyboard focus containment and mobile sizing.
If autoplay is blocked, Play remote audio allows an explicit playback gesture.
The Calls page shows genuine latest-50 history, missed states, direction, duration
and callbacks to existing conversations. Conversation headers link to call history.

Unanswered invitations time out after 45 seconds. Connecting calls time out 45
seconds after acceptance. Owner heartbeats expire after 35 seconds; expired or
revoked owning sessions also terminate the call on reconciliation. ICE failure
ends locally immediately; a disconnected media connection gets about 15 seconds
to recover. Signaling loss ends local media after about 15 seconds of unsuccessful
polls. Browsers may throttle hidden/background tabs and cause lease expiry;
background or locked-phone calling is not guaranteed. No service worker push or
OS-level incoming-call notification is included. Offline recipients see a missed
history row after timeout/reconciliation when they return.

End, failure, pagehide and provider unmount close the RTCPeerConnection and stop
all local/remote tracks. Late permission results are stopped immediately; stale
responses and callbacks are fenced from replacing a newer call. No ICE restart
or automatic redial is attempted; reconnect by starting another call.

Terminal transitions delete all that call's signaling in the same transaction
and release busy slots. Otherwise signals expire after ten minutes, independently
of call history retention. Cleanup retries naturally after database failure;
a failed transaction never partially releases another call's slot. History
metadata remains until a later explicit retention policy; audio/video is never
recorded. SDP/ICE may reveal network addresses to participants, STUN or TURN;
use relay-only mode when hiding direct peer addresses is required.

## Verification

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm exec next build --webpack
git diff --check
```

Database integration requires a **dedicated** TEST_DATABASE_URL and
TEST_DATABASE_SSL. Tests create/migrate/drop only randomly named temporary
schemas. Never use the application database. Add TEST_AUTH_HTTP=1 and CHROME_BIN
for the isolated Next.js HTTP/Chrome suites. The browser harness uses separate
temporary profiles; production builds and HTTP suites must run sequentially.
The test server disables external STUN/TURN regardless of private local settings.

Unit tests mock media/RTCPeerConnection to check permission timing, single-offer
negotiation, early ICE, duplicate responses, ownership, failure and track teardown.
Database tests cover creation races, busy slots, authorization, ownership,
transitions, SDP/ICE isolation, history, session expiry and bounded cleanup.
Chrome UI tests use explicitly mocked WebRTC with synthetic streams to test
controls. A separate two-profile Chrome test uses native RTCPeerConnection and
synthetic camera/microphone devices through the actual application signaling.
Neither test verifies physical devices, remote networks or TURN relay behavior.

### Milestone verification — October 15, 2026

`pnpm test` completed with 39 passed, no failures and seven skipped integration
suites. This includes ten calling unit/controller tests and a regression proving
that an in-flight ringing snapshot cannot overwrite a completed answer action.
`pnpm exec tsc --noEmit` and lint scoped to all milestone code passed. Full
`pnpm lint` reports the existing synchronous effect state update in
`components/settings/appearance-settings.tsx:15`.

The default `pnpm build` failed while downloading the existing Google Fonts in
the restricted environment. The Webpack build passed outside the sandbox
with its compiler subprocesses and existing font downloads available.

No dedicated TEST_DATABASE_URL is configured and PostgreSQL server binaries
are unavailable here. Database migrations, authenticated browser tests (including
the mocked UI suite), and the genuine two-profile WebRTC suite therefore were
not executed. Chrome alone cannot run those suites without their isolated database.
No application migration was run. Physical microphones/cameras, remote networks,
and TURN relay selection remain unverified. The user's conversation-list edit
and invalid checkpoint reference were preserved.
