# Messaging reliability and diagnosis

Messages use authenticated parameterized SQL, unique sender/client IDs, canonical
server responses and revision polling. A lost response retries the same client ID;
drafts survive network errors. History cursors retain microsecond ordering.
Membership and authorship are authoritative in every server operation.

The foreground sync loop has one in-flight request and a two-second target cadence,
subtracting request time and backing off on errors. It pauses hidden tabs and
refreshes on focus/reconnect/mutations. Slow requests, pool waits, cold compute,
region distance, retries and background throttling can all exceed that cadence;
two seconds is not a production delivery guarantee.

Investigate a reported 5–20 second delay with sender POST duration, receiver sync
start/end, visibility/network state and numeric Server-Timing app/pool/db values.
Measure from send initiation to the receiver rendering the message; optimistic
sender rendering is not delivery. Local isolated results cannot establish a live
latency improvement. Do not print message text, cookies, database URLs or tokens.

## Isolated measurements — 2026-10-20

Two real Chrome profiles using disposable PostgreSQL 17 and the local Next.js
Webpack development server measured 1386 ms and 830 ms from send click to the
other foreground conversation rendering the message. UI observation polls every
200 ms and includes browser-protocol overhead. These are two observations in a
warmed test journey, not a latency distribution or production benchmark.

Observed request maxima within that window: send 197 ms, sync 3561 ms,
instrumented pool acquisition 17.3 ms, instrumented transaction/database work
46.1 ms. Instrumented transaction time does not include every SQL/auth operation;
request duration includes development-server/browser overhead. No cause for the
reported live 5–20 second delay can be established from these local numbers.
No live access was requested or performed and no production speedup is claimed.

The two-user HTTP/browser audit passed all 16 checks, including registration,
login/logout, contacts, messaging, replies, edits, deletion, reads, responsive
navigation/settings and synthetic-device WebRTC. Test telemetry prints aggregate
numbers only. Follow-up database tests exercise the active messaging/attachment
queries after removing an unreferenced legacy query module; access denial and
soft-deletion coverage remain. The owning server role also passed the security
suite without SUPERUSER or BYPASSRLS privileges.
