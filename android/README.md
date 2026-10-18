# ChatBit Android (Trusted Web Activity)

This is packaging source/configuration for the same server-rendered Next.js
application, not a second frontend or a static export. Package ID is
`com.chatbit.messenger`; keep it and the release signing key stable for updates.
The pinned Bubblewrap 1.27.0 CLI/core and npm lockfile are build-only dependencies.

## Build a testing APK in GitHub Actions (no local SDK)

1. Push the reviewed commit yourself to the repository's default branch so GitHub
   can discover `.github/workflows/android-debug.yml`.
2. Open **Actions → Build ChatBit Debug APK → Run workflow**. Select the branch
   to test and enter the deployed ChatBit HTTPS origin in `origin`, with no path,
   query or credentials. Use the actual deployment you intend to test.
3. Wait for the `debug-apk` job to finish. Open the run's **Artifacts** section,
   download **ChatBit-debug-apk**, unzip it and install **ChatBit-debug.apk** on
   your Android phone. Allow installation from that download source when Android
   prompts. Chrome must be available. Optionally use `adb install -r` if installed.

This workflow is manual only, needs no repository variables, signing secrets or
Digital Asset Links, and cannot publish a GitHub Release. GitHub installs Node 24,
Temurin JDK 17, Android platform 36 and build tools 36.1.0. The pinned generator
reuses the existing TWA project template, Gradle 8.11.1 and Android Gradle plugin
8.9.1. Generated repositories use Google Maven/Maven Central instead of retired
JCenter. APKs are retained for 14 days. No local Android SDK installation is needed.

Minimum supported device OS is **Android 7.0 (API 24)** for both debug and release
packages. Android Browser Helper 2.7.4 requires API 24, so older devices are not
supported; no manifest SDK override is used. The maintained generator removes the
upstream template's obsolete source-manifest `package` attribute after generation.
Gradle retains both `namespace` and `applicationId`: `com.chatbit.messenger.debug`
for debug and `com.chatbit.messenger` for release. Packaging tests regenerate both
variants and verify these settings before CI compiles an APK.

Debug generation uses the checked-in ChatBit icons and packaging metadata, so a
deployment missing the new PWA assets does not block compilation. The app still
loads `/chat` from your supplied deployment and uses its real backend/accounts.
The workflow neither deploys web changes nor bundles an offline web application.

Gradle's `assembleDebug` automatically signs this testing APK using a disposable
runner debug key; `apksigner verify` must pass before the exact APK is uploaded.
It uses package **com.chatbit.messenger.debug** and launcher name **ChatBit Debug**
so it can coexist with a future release. No release certificate is fabricated or
added to the site's Digital Asset Links. Until a certificate/site association is
verified, Chrome may display its Custom Tab toolbar. Do not disable verification.
Debug keys can differ between runs: if Android rejects an update with a signing
conflict, uninstall the previous **ChatBit Debug** app before installing this one.
Never distribute this APK as a signed public release or Play submission.

Equivalent commands on a machine that already has the SDK/JDK (optional):

```bash
npm ci --prefix android --ignore-scripts
# Set CHATBIT_ANDROID_ORIGIN to your deployed HTTPS origin first.
node android/generate.mjs --debug
node android/build.mjs --debug
```

The existing release workflow below remains separately gated by repository
opt-ins, release signing credentials, certificate matching and deployed DAL.
Local source generation and simulated build orchestration passed; actual Android
compilation and device installation have not been verified in this workspace.
A successful GitHub run is required before an APK is available to download.

Reference: [Android command-line debug builds](https://developer.android.com/build/building-cmdline#build_a_debug_apk).

## Prerequisites and generation

1. Deploy the web changes to the reviewed stable HTTPS origin. Verify manifest,
   icons, login, uploads and calls in Android Chrome first.
2. Install Node 24, JDK **17** (required by this Bubblewrap version), Android SDK
   command-line tools, platform 36 and build tools **36.1.0**. Accept SDK licences
   interactively on your machine. No Android tools were available in this run.
3. Install locked tools with `npm ci --prefix android --ignore-scripts`.
4. Supply these environment variables privately to the shell/CI. Public origin,
   version and certificate fingerprint are not secrets; signing material is.

| Variable | Meaning |
| --- | --- |
| CHATBIT_ANDROID_ORIGIN | Actual stable HTTPS origin, no path/query/credentials |
| ANDROID_SHA256_FINGERPRINTS | Comma-separated SHA-256 release signing certificate fingerprints |
| ANDROID_VERSION_NAME | x.y.z, default 1.0.0 |
| ANDROID_VERSION_CODE | Increasing positive integer, default 1 |
| ANDROID_KEYSTORE_PATH | Absolute path to privately stored release keystore |
| ANDROID_KEY_ALIAS | Existing signing-key alias |
| BUBBLEWRAP_KEYSTORE_PASSWORD | Keystore password, secret |
| BUBBLEWRAP_KEY_PASSWORD | Signing-key password, secret |

Create and back up a release keystore using Android Studio/keytool outside source
control, e.g. under ignored `android/signing/`. Never paste its passwords in chat
or commit it. Extract the public SHA-256 fingerprint using `keytool -list -v`.
If Google Play App Signing is used, publish the **app-signing certificate**
fingerprint as well as the certificate signing your direct GitHub APK, not just
the upload-key fingerprint. Never rotate/delete keys casually.

Run `node android/generate.mjs --check` to validate without fetching assets.
Run `node android/generate.mjs` to generate Java, Android manifest, resources,
Gradle wrapper and project under ignored `android/generated/`. Generation downloads
public icons/web manifest from the configured origin. It fails if these are absent.
Generated source is reproducible from the locked generator, local config and
versioned web assets; artifact bytes/tool downloads are not claimed bit-identical.

Then run from the repository root (Linux/macOS or CI):

```bash
node android/check-site.mjs
node android/build.mjs
```

The script uses Gradle, zip alignment verification, apksigner and jarsigner
without interactive downloads or shell password interpolation. It builds a signed
`app-release-signed.apk` and `app-release-bundle.aab`. You can inspect/build the
regular generated Gradle project in Android Studio. For local unsigned compile
checks only, `node android/build.mjs --unsigned` is available; never publish unsigned
output. No APK or AAB was compiled or signed in this environment.

## Digital Asset Links and deployment

Set CHATBIT_ANDROID_ORIGIN and ANDROID_SHA256_FINGERPRINTS on the intended web
Production deployment. The server exposes `/.well-known/assetlinks.json` only
when both are valid and the request origin matches. It returns 404 otherwise;
no fake fingerprint is shipped. Verify HTTPS 200 JSON, package ID and real signing
certificate on that exact origin with no redirect. Each additional trusted origin
would need its own verified statement; none is configured by default. Verification
failure should retain the browser's Custom Tab UI; do not bypass verification.

Normal Next.js deployments appear on reload in the Android app. Package identity,
signing, icons/native metadata and permission/delegation changes require rebuilding
the APK. Server routes, cookies, authorization and Storage checks remain shared.

## Real-device checklist (not performed)

Use `adb install -r app-release-signed.apk` after enabling USB debugging. Confirm
DAL verification removes the Custom Tab toolbar for the real signed package.
Test login/logout/cookie expiry, gallery/document multi-selection, upload
cancel/retry, image viewer Back/Escape, video seeking/full screen, portrait and
landscape keyboard, safe areas, dark/system mode and offline fallback. Test
microphone/camera allow/deny and track cleanup. Browser origin permissions, not
native blanket storage permissions, control picker/media access. Use Chrome
remote inspection and check for CSP/network/hydration errors. Test calls between
two real devices/networks; TURN remains unverified.

This does not provide native background calling, arbitrary background execution,
closed-app push or offline private chat storage. A future push service would need
Web Push subscriptions and explicit permissions; reliable native incoming calls
would require a separately reviewed Android calling/service integration and
platform-policy work. Neither comes automatically from TWA packaging.

Official references:
- https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start

## GitHub Actions setup (not executed)

`.github/workflows/android-release.yml` runs only through **Run workflow**.
It does nothing until repository variable `CHATBIT_ANDROID_BUILDS_ENABLED=true`.
Set repository variables `CHATBIT_ANDROID_ORIGIN`, `ANDROID_SHA256_FINGERPRINTS`
and `ANDROID_KEY_ALIAS` to the reviewed values above. Store these GitHub Secrets:

- `ANDROID_KEYSTORE_BASE64`: base64 encoding of the backed-up release keystore.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_PASSWORD`: signing-key password.

Deploy matching Digital Asset Links first. CI compares the actual keystore's
public certificate to the configured fingerprints and requires matching HTTPS
DAL without redirects. Tests, build, lint, TypeScript and fixture Android source
generation precede signing. Signed APK/AAB artifacts are retained for 14 days.
The key is never uploaded; its runner copy is removed even on failure.
Do not run untrusted changes with signing secrets. Protect repository write access,
release tags and workflow edits; optionally configure a protected environment.

For artifacts, run manually with `publish=false`, x.y.z version and an increasing
version code. For a future release, review and push the matching `vx.y.z` tag
yourself, set `CHATBIT_ANDROID_RELEASES_ENABLED=true`, and explicitly run the
workflow **from that tag** with `publish=true`. Only publication receives
`contents: write`; other jobs have read access. Repository/org Actions policy must
permit that scope. Publishing remains off by default; existing releases are never
overwritten. The APK is named `ChatBit-vx.y.z.apk`; an AAB is also attached for
future Play distribution, which still requires Play Console setup and review.

No workflow, live DAL verification, Gradle compile, signing, upload or GitHub
Release was executed during implementation. GitHub-hosted Android tooling and
network downloads remain CI verification boundaries.
