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
