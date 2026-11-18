# TailorMade

TailorMade is an iOS and Android app that rewrites your resume for a specific job.

1. **Upload your general resume (PDF) once.** It's turned into structured data and stored only on your phone.
2. **Pick a job.** Paste a job-listing link, paste the description, or just type a job title.
3. **Get a tailored resume.** You also get a match score, the keywords you already match, the gaps, a list of what changed, and a cover letter. You can export the resume and the cover letter as PDFs, or share them.

The AI is told never to invent employers, titles, dates, degrees or numbers. It can only reword, reorder and emphasize what's already on your resume. Requirements you don't meet are shown as "gaps" and never added to the resume.

```
app/      Expo (React Native) app that builds for iOS + Android from one codebase
server/   Small Node/TypeScript API that holds the Claude API key, reads job links, and calls Claude
```

## Why there's a server

Your Anthropic API key **must not** be put inside the app. Anyone can pull it out of an app bundle. The app talks to `server/`, which keeps the key and makes the AI calls. The server keeps only accounts and usage counts. Resumes and results are never saved on the server.

## Accounts and limits

- **Sign-in:** Sign in with Apple (iOS) and Google (iOS + Android). The app gets an identity token from Apple or Google. The server checks it against Apple's or Google's public keys, then issues its own 30-day session, which the app stores in the iOS Keychain or Android Keystore (`expo-secure-store`).
- **Per-user limits:** every signed-in user has a plan. By default the free plan allows 10 tailored resumes per calendar month and 5 resume uploads per day. Change these with env vars, no app update needed. A use is counted only if the request succeeds: a bad link or an AI error doesn't use a credit. The check is atomic, so firing requests in parallel can't go over the limit.
- **Plans:** `free` and `pro`. Promote someone with `npm run set-plan -- someone@example.com pro` (in `server/`). This is where subscriptions plug in later: a payment webhook (e.g. RevenueCat) sets the plan.
- **Account deletion:** Account → Delete account removes the server account and the on-device data. Apple requires this for any app with sign-in.
- **Storage:** accounts and usage are kept in a SQLite file (`DB_PATH`). On-device resume data is kept separately for each account, so a shared phone never mixes people's resumes.

## Run it locally

**Server**

```bash
cd server
cp .env.example .env        # set ANTHROPIC_API_KEY; for local testing also set ALLOW_DEV_LOGIN=1
npm install
npm run dev                 # http://localhost:8787
```

**App**

```bash
cd app
cp .env.example .env.local  # set EXPO_PUBLIC_API_URL to http://<your-computer-LAN-IP>:8787
npm install
npx expo start              # scan the QR code with Expo Go on your phone
```

In Expo Go, use the **Dev sign-in** box on the sign-in screen. It appears only in development builds and works only when the server has `ALLOW_DEV_LOGIN=1`. Google Sign-In is native code that Expo Go doesn't include. To test real Google/Apple sign-in, make a development build: `npx eas-cli@latest build --profile development --platform ios` (or `android`), install it, then run `npx expo start`.

## Subscriptions (Pro)

Payments go through [RevenueCat](https://www.revenuecat.com/) (free up to $2.5k/month in revenue). It handles App Store and Google Play billing, receipts, renewals and refunds. Our user ID is RevenueCat's `app_user_id`, and the server always asks RevenueCat's API for the current status. It never trusts what the app says.

- **Upgrade screen** (`app/src/app/upgrade.tsx`): shows the plans from your RevenueCat offering, with Subscribe and Restore purchases buttons, plus the auto-renewal text and Terms/Privacy links that Apple requires. It appears when a free user runs out, and from the home and Account screens.
- **Unlocking Pro:** after a purchase the app calls `POST /api/billing/sync`, so Pro turns on within seconds. RevenueCat's webhook (`POST /api/billing/revenuecat-webhook`) also keeps the server up to date on renewals, cancellations, refunds and billing problems (grace periods count as active).
- **Manual overrides** still work: `npm run set-plan -- someone@example.com pro` (set back to `free` to go back to their subscription status).

**Setup**
1. **Stores.** In App Store Connect and Play Console, create auto-renewing subscription products, e.g. `pro_monthly` and `pro_annual`. Apple also needs the Paid Apps agreement signed and banking/tax details filled in.
2. **RevenueCat.** Create a project and add the iOS and Android apps. Create an entitlement **`pro`**, attach both products to it, then create an offering marked *current* with monthly/annual packages.
3. **App** (`app/eas.json`): `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (public SDK keys), plus `EXPO_PUBLIC_PRIVACY_URL`. `EXPO_PUBLIC_TERMS_URL` is optional and defaults to Apple's standard EULA.
4. **Server.** Set `REVENUECAT_SECRET_KEY` (a v1 secret API key). Then add a webhook in RevenueCat pointing to `https://<your server>/api/billing/revenuecat-webhook` with an Authorization header value, and set the same value as `REVENUECAT_WEBHOOK_AUTH`.
5. **Testing.** Use sandbox testers (App Store Connect → Users and Access → Sandbox) and Play Console license testers. Purchases need a real build from TestFlight or a Play testing track, not Expo Go.

## Install a test APK on your Android phone

A **test build** is for your own phone, not the store. It has a *server address* box and email *test sign-in* on the sign-in screen, and it may talk to a server over plain HTTP on your Wi-Fi. Store builds have none of this.

1. **Run the server on your computer**, with the computer and phone on the same Wi-Fi:
   ```bash
   cd server
   cp .env.example .env      # set ANTHROPIC_API_KEY and ALLOW_DEV_LOGIN=1
   npm install && npm run dev
   ```
   Find your computer's local IP address (`ipconfig` on Windows, System Settings → Wi-Fi → Details on Mac, e.g. `192.168.1.23`). On Windows, click **Allow** if the firewall asks about Node.js.
2. **Install the APK.** Copy `TailorMade-test.apk` to the phone and tap it. Android asks you to allow installing from that app (Files, Chrome, Drive…) the first time. If Play Protect warns that it's from an unknown developer, tap *More details → Install anyway*. That warning is normal for apps not from the Play Store.
3. **Open TailorMade Test.** Enter `http://<your computer's IP>:8787` as the server address and any email in *Test sign-in*.

**Build a new test APK**
- *In the cloud (easiest):* `cd app && npx eas-cli@latest build --platform android --profile preview`, then open the link it prints on your phone.
- *On a computer with the Android SDK:*
  ```bash
  cd app
  EXPO_PUBLIC_TEST_BUILD=1 npx expo prebuild --platform android --clean
  cd android && EXPO_PUBLIC_TEST_BUILD=1 ./gradlew assembleRelease
  # → android/app/build/outputs/apk/release/app-release.apk
  ```
  Local test builds are signed with Android's shared debug key. That's fine for your own phone, never for the Play Store.

## Set up Sign in with Apple and Google

**Apple** (iOS)
1. Apple Developer → Certificates, IDs & Profiles → Identifiers → your app ID → enable **Sign in with Apple**. EAS turns it on automatically on the first build, because `ios.usesAppleSignIn` is set.
2. Server: `APPLE_BUNDLE_IDS=<your bundle id>`.

**Google** (iOS + Android), in [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services:
1. Set up the **OAuth consent screen** (app name, support email, privacy policy URL).
2. Credentials → Create OAuth client ID:
   - **Web application.** This is the ID the app passes as `webClientId`, and the audience of the tokens the server checks.
   - **iOS**, with your bundle ID.
   - **Android**, with your package name and the SHA-1 signing fingerprint (`npx eas-cli@latest credentials` shows it). Add a second Android client with the **Play App Signing** SHA-1 from Play Console → Setup → App signing, or sign-in fails in store builds.
3. App: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in `app/eas.json` (and `.env.local`). In `app/app.json`, set the Google plugin's `iosUrlScheme` to the iOS client's "reversed client ID" (`com.googleusercontent.apps.…`).
4. Server: `GOOGLE_CLIENT_IDS=<web client id>,<ios client id>`.

Checks: `npm run typecheck` in both folders.

## Deploy the server

`server/Dockerfile` works on any container host, such as Render, Railway, Fly.io, Google Cloud Run or AWS App Runner. Set these on the host (see `server/.env.example`):

- `NODE_ENV=production`, `ANTHROPIC_API_KEY`, and `SESSION_SECRET` (generate with `openssl rand -base64 48`; the server won't start in production without it).
- `APPLE_BUNDLE_IDS`, `GOOGLE_CLIENT_IDS`, and the limit variables if you want different numbers.
- `TRUST_PROXY=1` on hosts behind a load balancer (almost all of them).
- A **persistent volume mounted at `/data`**. That's where the SQLite database lives. Without it, accounts and usage counts reset on every deploy.

Run a single instance: SQLite and the per-IP limiter live on one machine. If you outgrow that, move `server/src/db.ts` to Postgres. The host must provide HTTPS, because both stores require it in practice. Then put the server's URL in `app/eas.json` under `EXPO_PUBLIC_API_URL`.

## Publish to the App Store and Google Play

The app builds in the cloud with [EAS](https://docs.expo.dev/eas/), so you don't need Xcode or Android Studio.

**Accounts you need**

- Apple Developer Program ($99/yr): https://developer.apple.com/programs/
- Google Play Console ($25 one-time): https://play.google.com/console
- Expo account (free): https://expo.dev/signup

**One-time setup**

1. In `app/app.json`, change `ios.bundleIdentifier` and `android.package` from `com.tailormade.app` to an ID you own, e.g. `com.yourname.tailormade`. These can't be changed after you publish.
2. Replace the placeholder images in `app/assets/`. You need a 1024×1024 icon, the Android adaptive-icon layers and a splash image.
3. Set your deployed server URL in `app/eas.json` → `build.production.env.EXPO_PUBLIC_API_URL`.
4. Host `PRIVACY.md` at a public URL (GitHub Pages or a Notion page is fine). Both stores ask for this link.

**Build and submit**

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest init                                   # links the project to your Expo account
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --latest         # uploads to App Store Connect / TestFlight
npx eas-cli@latest submit --platform android --latest     # uploads to Play Console (internal track)
```

EAS creates and manages the signing certificates and keystores for you. For the first Android upload, Google requires you to upload the `.aab` by hand in Play Console once. After that, `eas submit` works.

**Store listing checklist**

- *App Store Connect → App Privacy.* Declare "User Content (resume / other user content)" used for **App Functionality**, not linked to identity, not used for tracking. Data is sent to your server and to Anthropic to generate results and isn't stored.
- *Google Play → Data safety.* Mark that it collects "Files and docs" and "Personal info (name, email, phone, address)". Say the data is processed ephemerally, encrypted in transit, not shared for advertising, and can be deleted in the app (Resume → "Delete all my data").
- *Apple review notes.* Reviewers can sign in with their own Apple ID. Give them a sample resume PDF and a public job link so they can test the full flow. Apple rejects apps whose main feature they can't try. Make sure a fresh account has free uses left. Mention that account deletion is under Account → Delete account (guideline 5.1.1(v)).
- *Google Play → Data safety → Account.* Declare that the app creates accounts, collects email and name for account management, and offers in-app deletion. Play also asks for a **web link where users can request account deletion**. Add a section to your privacy page saying how (e.g. "email us" or "use Account → Delete account in the app").
- *AI disclosure.* The app shows "AI can make mistakes" on every result. Keep this, and mention AI generation in the store description.
- *Testing first.* Use TestFlight (iOS) and the Internal testing track (Android) before going to production. Google requires new personal developer accounts to run a closed test with 12 testers for 14 days before going public.

## How it works

| Step | Endpoint | What happens |
|---|---|---|
| Sign in | `POST /api/auth/apple` / `POST /api/auth/google` | Checks the Apple/Google identity token and returns a session token, the user and current usage. |
| Account | `GET /api/me`, `DELETE /api/me` | Current usage and limits; delete the account. |
| Upload resume | `POST /api/resume/parse` (multipart `resume`) | The PDF is sent to Claude as a document and comes back as structured JSON (`server/src/schema.ts`). |
| Tailor | `POST /api/tailor` `{profile, jobUrl? \| jobText? \| jobTitle?}` | The server fetches the job page: it reads schema.org `JobPosting` data when present, otherwise strips the HTML, and blocks private network addresses. Claude then returns the tailored resume, fit analysis and cover letter as validated JSON. |

All resume endpoints require `Authorization: Bearer <session>` and count against the user's limits (`server/src/limits.ts`). Model: `claude-opus-5-5` with structured outputs and server-side refusal fallback (`server/src/claude.ts`).
