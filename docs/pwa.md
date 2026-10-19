# Install ChatBit from your browser

Open https://chat-bit-rouge.vercel.app over HTTPS in a supported browser. On
Android Chrome use the browser's **Install app** or **Add to Home screen** menu.
On iPhone/iPad use Safari's Share menu and **Add to Home Screen**. Desktop Chrome
and Edge offer installation in the address bar or browser menu when eligible.
The site must be deployed before local changes are available on your phone.

The landing page and **Settings → Appearance** offer **Install ChatBit** only
after a supported browser provides an install prompt. Installation is never
requested automatically. Dismissing it suppresses another offered prompt for
seven days on that browser; manual browser-menu installation remains available.
Unsupported browsers receive manual instructions instead of a nonworking button.

The installed app uses `/chat`, scope `/`, standalone display, the same accounts,
backend and private storage as the website. Website updates arrive through Vercel
and reload; no APK build, signing key or Android release workflow is required.

Chats, messages and private media require a connection. The service worker caches
only a self-contained public connection-recovery document, never authenticated APIs, sessions or
attachments. Browser notification preferences work only while the web application
is running with permission. No closed-app push, native background calling or
offline outbox is provided. Calls depend on browser permissions and network/TURN
availability; installation does not remove those limits.
