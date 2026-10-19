# Two-account, two-device release check

Use your own test accounts A/B on two devices at the reviewed HTTPS deployment.
These are manual live checks, not automated production tests. Record device,
browser, deployment commit, time, screenshots and console/network errors.

1. Register A and B with distinct emails and 8–128 character passwords; test short
   input errors, login/logout and an invalid login. Do not reuse private passwords.
   If authentication says temporarily unavailable, capture the request time and
   safe Vercel auth diagnostic operation/stage/code, without cookies or secrets.
2. A finds B through Contacts/new conversation; B opens it. Send both directions,
   including long multiline text and emoji. Confirm immediate Sending feedback,
   correct order, one copy each and failure feedback with the draft kept.
3. Reply, edit and delete your own messages. Verify B sees changes and cannot edit
   A's messages. Check read receipts with B visible versus hidden; reopen B after
   several messages and confirm missed messages arrive. Load older history and
   verify new arrivals do not pull you away from the older messages.
4. Select photos, MP4/WebM and PDF/TXT/DOCX within the allowlist; preview/remove
   queued files, send a batch, cancel mid-upload and retry unsent files. Verify
   inline images/video seeking/full-screen Back, secure downloads and names/sizes.
   Reject empty, unsupported and >10 MiB files. The account quota stays 100 MiB.
5. On Android Chrome, test phone portrait/landscape, system Back, bottom tabs,
   long press versus scrolling, text selection, Shift+F10 on a hardware keyboard,
   emoji/normal keyboard switching and composer visibility with the keyboard open.
   Repeat small/large phone and tablet sizes; check no clipping/double scroll.
6. On the landing page or Settings → Appearance, install through the browser
   prompt when offered; dismiss once and verify no repeated prompt. Try manual
   instructions on Safari/unsupported browsers. Launch the installed app, sign
   in, navigate/back and reload after a web deployment to check updates.
7. Switch light/dark/system; change OS appearance. Update profile/avatar; verify
   the other device sees permitted changes. Check privacy/notification settings
   reflect their actual capabilities and browser permissions.
8. Start voice/video calls in both directions. Allow/deny permissions, answer,
   decline, wait for timeout, mute, toggle camera and end from each side. Confirm
   tracks stop and call history updates. Retry on two networks. Record failures:
   TURN is not verified, and installed PWA does not supply background calling.
   An audible ringtone is not guaranteed by the current implementation/browser.
9. Throttle/disconnect while sending/uploading/calling. Reconnect and foreground
   the app; verify one authoritative message per confirmed send, no stale call
   revival, clear retry feedback and no sensitive offline content. Offline
   navigation should show a public reconnect page, not cached chats.
10. Log out, revisit protected URLs and test expiration/revocation via account
    session controls. Password change should revoke existing sessions. Do not
    change other users' accounts or production database permissions.

Measure delivery with DevTools on both devices: POST duration, sync intervals,
response Server-Timing (app/pool/db), render timestamp and tab visibility. Report
several samples plus failures. Local tests alone cannot establish the 1–3 second
production target or resolve a production authentication outage.
