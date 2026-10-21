# ChatBit navigation performance

## Initial audit

The baseline is commit `7a211d7`. There is one HTML root layout and one shared authenticated `(app)` layout, covering chats, conversations, contacts, calls, shared files and settings/profile. Theme and install providers are above route groups. Public/authenticated route groups do not define competing HTML roots.

Internal document navigation was not the confirmed cause. Existing conversation/mobile links already use `next/link`; desktop section buttons use `router.push`. Logout remains a server action with session revocation/redirect. Attachment downloads intentionally navigate to an authorized download response; those URLs must not be routed through Next.js or prefetched.

Confirmed opportunities:

- Creating a conversation calls `router.push` and immediately `router.refresh`, causing an additional refresh of shared server data.
- Desktop section buttons have no link-native pending feedback or prefetch behavior.
- Conversation links use viewport prefetch across the whole private list.
- Route branches unmount the conversation sidebar when opening settings, contacts, shared files or calls, losing search/filter/list scroll state.
- The realtime effect depends on conversation identity and recreates its polling loop/listeners at route changes. An incoming thread registration also requests a forced snapshot.
- Conversation components are keyed by conversation ID, correctly isolating message data, but composer text and message scroll state are discarded on unmount.
- Existing dynamic viewport height, safe-area padding, inline media previews and offline-only service worker already support mobile PWA use. The service worker must continue to exclude private data and RSC/API caching.

Local baseline measurements and final verification will be recorded below. No production data is used for browser fixtures.
