# Touch Website Studio

Mundy Morning Studios Android app: create, edit, maintain and publish a user-owned website from a phone.
Local-first; you own the files, hosting account and domain. Netlify is the first one-tap publishing target.

**Status:** first debug APK on branch `claude/touch-website-studio-first-build` (not merged). See
`docs/WEBSITE_STUDIO_BUILD_BRIEF.md` (scope), `docs/DECISIONS.md`, `docs/BRANCH_STATUS.md` and
`docs/knowledge/reports/` (what is and is not verified).

## Layout
- `app/src/main/java/...` – Android shell: `MainActivity` (WebView + bridge), `ProjectStore`, `ZipUtil`, `NetlifyClient`, `SecretStore`, `ImageUtil`, `ShareProvider`.
- `app/src/main/assets/studio/` – the UI: `site.js` (schema, templates, renderer – shared by preview and export), `app.js`, `studio.css`.
- `app/src/test/` – JVM unit tests (storage, ZIP safety, Netlify client against a local mock server).
- `tests/site.test.js` – Node tests for the renderer/model; `tests/ui/smoke.js` – headless-Chromium UI smoke test against a mock native bridge.

## Build and test
```bash
node --test tests/*.test.js
./gradlew testDebugUnitTest assembleDebug   # APK: app/build/outputs/apk/debug/app-debug.apk
```
CI (`.github/workflows/build-apk.yml`) runs the same on every `claude/**` push and uploads the debug APK as an artifact.

## Publishing to Netlify
Create a personal access token in Netlify (User settings → Applications), paste it in the app's Netlify screen, create or link a site, preview, tick the approval box and publish. Saving never publishes. If publishing fails, export the website ZIP and upload it manually.
